#!/usr/bin/env python3
"""Import the Schaefer-1000 connectome bundled in python/datasets/advanced_connectome.

That dataset carries what the synthetic FC matrices in datasets/*.csv do not:
real region names, Yeo-7 network membership, hemisphere labels and MNI
coordinates. Those are what the 3D Visual Explorer and Activity Map render, and
what makes sensory/motor region selection meaningful rather than arbitrary
indices.

The raw matrix is 99.9% dense (999,000 edges), which is a functional-connectivity
artefact rather than anatomy — every region correlates with every other to some
degree. Importing it as-is would create a million rows and a model whose
mean-field normalisation drowns every individual pathway. `--threshold` keeps
the strongest edges; the default of 0.30 yields a connectome of realistic
density.

Usage:
  python3 scripts/import_schaefer1000.py                       # default threshold
  python3 scripts/import_schaefer1000.py --threshold 0.4       # sparser
  python3 scripts/import_schaefer1000.py --limit 400           # first N regions
  python3 scripts/import_schaefer1000.py --dry-run
"""
import argparse
import os
import sys
from pathlib import Path

import numpy as np
import requests

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "python" / "datasets" / "advanced_connectome"
API_BASE = os.environ.get("BRAINFORGE_API", "http://localhost:3001")
HEADERS = {"Content-Type": "application/json", "X-Dev-User": "dev@brainforge.local"}


def load(limit=None):
    weights = np.loadtxt(DATA / "weights.csv", delimiter=",")
    regions = []
    with open(DATA / "coords.csv") as fh:
        for i, line in enumerate(fh):
            parts = line.strip().split(",")
            if len(parts) < 5:
                continue
            name, x, y, z, hemi = parts[0], *parts[1:4], parts[4]
            regions.append({
                "name": name,
                "abbreviation": name.split()[0][:12],   # Yeo-7 network label
                "hemisphere": hemi,
                "atlasIndex": i,
                "coordX": float(x), "coordY": float(y), "coordZ": float(z),
            })
    if limit:
        regions = regions[:limit]
        weights = weights[:limit, :limit]
    assert weights.shape[0] == len(regions), (
        f"weights {weights.shape} does not match {len(regions)} regions")
    return weights, regions


def build_connections(weights, threshold):
    """Keep edges above threshold, dropping self-connections."""
    n = weights.shape[0]
    src, tgt = np.nonzero(weights >= threshold)
    keep = src != tgt
    src, tgt = src[keep], tgt[keep]
    w = weights[src, tgt]
    return [
        {"sourceIndex": int(s), "targetIndex": int(t), "weight": float(x), "delay": 0.0}
        for s, t, x in zip(src, tgt, w)
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--threshold", type=float, default=0.30)
    ap.add_argument("--limit", type=int, default=None,
                    help="import only the first N regions (e.g. 400)")
    ap.add_argument("--name", default=None)
    ap.add_argument("--api", default=API_BASE)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    weights, regions = load(args.limit)
    n = len(regions)
    conns = build_connections(weights, args.threshold)
    name = args.name or f"Schaefer-{n} Connectome"
    density = len(conns) / max(n * (n - 1), 1)

    print(f"{name}")
    print(f"  regions:     {n}")
    print(f"  connections: {len(conns):,} (density {density:.1%}, threshold {args.threshold})")
    nets = sorted({r['abbreviation'] for r in regions})
    print(f"  networks:    {', '.join(nets)}")
    hemis = {}
    for r in regions:
        hemis[r["hemisphere"]] = hemis.get(r["hemisphere"], 0) + 1
    print(f"  hemispheres: {hemis}")

    if args.dry_run:
        print("\n(dry run — nothing uploaded)")
        return 0

    resp = requests.post(f"{args.api}/api/models", headers=HEADERS, timeout=30, json={
        "name": name,
        "description": (
            f"Schaefer {n}-region cortical parcellation with Yeo-7 network labels "
            f"and MNI coordinates. Edges thresholded at {args.threshold} "
            f"({density:.1%} density)."
        ),
        "defaultBackend": "rate_based",
        "parameters": {"tau": 0.01, "gain": 1.0, "noise_sigma": 0.05,
                       "global_coupling": 2.0, "threshold": 0.5},
    })
    resp.raise_for_status()
    model_id = resp.json()["id"]
    print(f"\n  created model {model_id}")

    resp = requests.post(f"{args.api}/api/models/{model_id}/import", headers=HEADERS,
                         timeout=600, json={"regions": regions, "connections": conns})
    resp.raise_for_status()
    print(f"  imported: {resp.json()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
