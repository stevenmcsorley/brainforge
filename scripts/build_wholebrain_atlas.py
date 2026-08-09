#!/usr/bin/env python3
"""Build a ~1500-region whole-brain connectome from real atlases.

Schaefer-2018 covers cortex only, so a Schaefer-1000 model has no subcortex,
cerebellum or brainstem. This combines:

  * **Schaefer-1000** (Yeo-7 networks) — cortical parcels
  * **Harvard-Oxford subcortical** — thalamus, striatum, hippocampus, amygdala,
    accumbens, brainstem
  * **DiFuMo-1024** — whole-brain probabilistic modes, used to fill cerebellar,
    brainstem and any remaining territory the two above leave uncovered

Every region keeps a real MNI centroid computed from the atlas volume, a real
anatomical label, and a hemisphere assignment from the sign of its x-coordinate.

**The connectivity is synthetic.** Real tractography for a 1500-region
parcellation is not something that can be derived from these atlases; weights
here are distance-dependent (exponential falloff over `--sigma` mm) plus sparse
long-range edges, which reproduces small-world structure but is not anatomy.
Do not draw neuroscientific conclusions from the edge weights. The coordinates
and labels are real; the wiring is a plausible placeholder.

Requires nilearn (`.venv/bin/pip install nilearn`). Atlas downloads are cached
in ~/nilearn_data.

Usage:
  .venv/bin/python scripts/build_wholebrain_atlas.py            # write CSVs
  .venv/bin/python scripts/build_wholebrain_atlas.py --import   # and upload
"""
import argparse
import os
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "python" / "datasets" / "wholebrain_1500"
API_BASE = os.environ.get("BRAINFORGE_API", "http://localhost:3001")
HEADERS = {"Content-Type": "application/json", "X-Dev-User": "dev@brainforge.local"}

# Harvard-Oxford entries that are not grey-matter structures.
# Reject a filler parcel whose centroid duplicates one already collected. This
# is applied only to the DiFuMo fill pass — Schaefer parcels are a partition and
# are kept as-is, so the minimum separation in the final atlas can be smaller
# than this (measured 4.3 mm between two adjacent Schaefer parcels).
MIN_SEPARATION_MM = 6.0

HO_SKIP = {"background", "left cerebral white matter", "right cerebral white matter",
           "left cerebral cortex", "right cerebral cortex",
           "left lateral ventricle", "right lateral ventricle"}


def _centroids(img, labels, skip_zero=True):
    """MNI centroid of every labelled parcel in a deterministic atlas volume."""
    import nibabel as nib
    data = np.asarray(img.dataobj)
    affine = img.affine
    out = []
    for idx in range(1 if skip_zero else 0, len(labels)):
        mask = data == idx
        if not mask.any():
            continue
        vox = np.argwhere(mask).mean(0)
        mni = affine @ np.append(vox, 1.0)
        out.append((labels[idx], mni[:3]))
    return out


def collect_regions(want_total):
    from nilearn import datasets, image

    regions = []

    # --- cortex -----------------------------------------------------------
    sch = datasets.fetch_atlas_schaefer_2018(n_rois=1000, resolution_mm=2)
    labs = [l.decode() if isinstance(l, bytes) else str(l) for l in sch.labels]
    if labs and labs[0].lower() == "background":
        labs = labs[1:]
    img = image.load_img(sch.maps)
    for name, xyz in _centroids(img, ["Background"] + labs):
        clean = name.replace("7Networks_", "")
        parts = clean.split("_")
        network = parts[1] if len(parts) > 1 else "Cortex"
        regions.append(dict(name=clean, network=network, source="Schaefer1000", xyz=xyz))

    # --- subcortex --------------------------------------------------------
    ho = datasets.fetch_atlas_harvard_oxford("sub-maxprob-thr25-2mm")
    ho_labels = [str(x) for x in ho.labels]
    for name, xyz in _centroids(image.load_img(ho.maps), ho_labels):
        if name.strip().lower() in HO_SKIP:
            continue
        regions.append(dict(name=name, network="Subcortex",
                            source="HarvardOxford", xyz=xyz))

    # --- cerebellum, brainstem and remaining coverage ----------------------
    # DiFuMo modes are probabilistic and whole-brain. Take those whose centroid
    # of mass falls outside territory the atlases above already cover, so the
    # result has no duplicated regions.
    dif = datasets.fetch_atlas_difumo(dimension=1024, resolution_mm=2)
    dif_labels = [str(x) for x in dif.labels]
    img4d = image.load_img(dif.maps)
    data = np.asarray(img4d.dataobj)
    affine = img4d.affine
    existing = np.array([r["xyz"] for r in regions])
    for k in range(data.shape[3]):
        if len(regions) >= want_total:
            break
        vol = data[..., k]
        if not np.isfinite(vol).any() or vol.max() <= 0:
            continue
        # Centre of mass of the probabilistic mode.
        w = np.clip(vol, 0, None)
        tot = w.sum()
        if tot <= 0:
            continue
        grid = np.indices(w.shape).reshape(3, -1)
        vox = (grid * w.reshape(1, -1)).sum(1) / tot
        xyz = (affine @ np.append(vox, 1.0))[:3]
        if np.linalg.norm(existing - xyz, axis=1).min() < MIN_SEPARATION_MM:
            continue
        label = dif_labels[k] if k < len(dif_labels) else f"DiFuMo_{k}"
        network = ("Cerebellum" if xyz[2] < -30
                   else "Brainstem" if abs(xyz[0]) < 12 and xyz[2] < 0
                   else "Subcortex")
        regions.append(dict(name=f"{network}_{label}", network=network,
                            source="DiFuMo1024", xyz=xyz))
        existing = np.vstack([existing, xyz])
    return regions


def build_weights(regions, sigma, long_range_frac, seed=42):
    """Distance-dependent small-world weights. Synthetic — see module docstring."""
    rng = np.random.default_rng(seed)
    xyz = np.array([r["xyz"] for r in regions])
    n = len(regions)
    d = np.linalg.norm(xyz[:, None, :] - xyz[None, :, :], axis=2)
    W = np.exp(-d / sigma)
    np.fill_diagonal(W, 0.0)
    n_long = int(long_range_frac * n * n)
    rows = rng.integers(0, n, n_long)
    cols = rng.integers(0, n, n_long)
    for r, c in zip(rows, cols):
        if r != c:
            W[r, c] = max(W[r, c], rng.uniform(0.01, 0.1))
    return W / W.max()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--regions", type=int, default=1500)
    ap.add_argument("--sigma", type=float, default=40.0, help="mm falloff")
    ap.add_argument("--long-range", type=float, default=0.04)
    ap.add_argument("--threshold", type=float, default=0.4)
    ap.add_argument("--import", dest="do_import", action="store_true")
    ap.add_argument("--api", default=API_BASE)
    args = ap.parse_args()

    print("Building whole-brain atlas from Schaefer-1000 + Harvard-Oxford + DiFuMo-1024")
    regions = collect_regions(args.regions)
    n = len(regions)
    by_src = {}
    for r in regions:
        by_src[r["source"]] = by_src.get(r["source"], 0) + 1
    by_net = {}
    for r in regions:
        by_net[r["network"]] = by_net.get(r["network"], 0) + 1
    print(f"  regions: {n}")
    print(f"  by source:  {by_src}")
    print(f"  by network: {dict(sorted(by_net.items(), key=lambda kv: -kv[1]))}")

    W = build_weights(regions, args.sigma, args.long_range)
    OUT.mkdir(parents=True, exist_ok=True)
    np.savetxt(OUT / "weights.csv", W, delimiter=",", fmt="%.5f")
    with open(OUT / "coords.csv", "w") as fh:
        for r in regions:
            x, y, z = r["xyz"]
            hemi = "left" if x < -1 else ("right" if x > 1 else "midline")
            fh.write(f"{r['name']},{x:.4f},{y:.4f},{z:.4f},{hemi},{r['network']},{r['source']}\n")
    print(f"  wrote {OUT}/weights.csv and coords.csv")

    edges = int((W >= args.threshold).sum() - (np.diag(W) >= args.threshold).sum())
    print(f"  edges at threshold {args.threshold}: {edges:,} "
          f"({edges / max(n * (n - 1), 1):.1%} density)")

    if not args.do_import:
        print("\n(pass --import to upload to the API)")
        return 0

    import requests
    api_regions = []
    for i, r in enumerate(regions):
        x, y, z = r["xyz"]
        api_regions.append(dict(
            name=r["name"][:190],
            abbreviation=r["network"][:12],
            hemisphere="left" if x < -1 else ("right" if x > 1 else "midline"),
            atlasIndex=i, coordX=float(x), coordY=float(y), coordZ=float(z)))
    src, tgt = np.nonzero(W >= args.threshold)
    keep = src != tgt
    conns = [dict(sourceIndex=int(s), targetIndex=int(t), weight=float(W[s, t]), delay=0.0)
             for s, t in zip(src[keep], tgt[keep])]

    resp = requests.post(f"{args.api}/api/models", headers=HEADERS, timeout=30, json=dict(
        name=f"Whole-Brain {n} (Schaefer+HO+DiFuMo)",
        description=(
            f"{n}-region whole-brain parcellation: Schaefer-1000 cortex, "
            f"Harvard-Oxford subcortex, DiFuMo-1024 cerebellar/brainstem fill. "
            f"Real MNI coordinates and anatomical labels. Connectivity is "
            f"SYNTHETIC (distance falloff sigma={args.sigma}mm plus sparse "
            f"long-range edges), not tractography."),
        defaultBackend="rate_based",
        parameters={"tau": 0.01, "gain": 1.0, "noise_sigma": 0.05,
                    "global_coupling": 2.0, "threshold": 0.5}))
    resp.raise_for_status()
    model_id = resp.json()["id"]
    print(f"\n  created model {model_id}")
    resp = requests.post(f"{args.api}/api/models/{model_id}/import", headers=HEADERS,
                         timeout=1800, json=dict(regions=api_regions, connections=conns))
    resp.raise_for_status()
    print(f"  imported: {resp.json()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
