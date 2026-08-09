#!/usr/bin/env python3
"""Generate supporting datasets for the Schaefer-1000 model.

Produces resting-state BOLD timeseries and the functional connectivity derived
from them, then registers both with the API so they appear on the Datasets page.

The timeseries are synthetic but not arbitrary: each region's signal is a mixture
of a shared global component, a component shared within its Yeo-7 network, and
independent noise. That reproduces the block structure real resting-state data
shows — within-network correlations well above between-network ones — so the FC
matrix is a plausible target for model fitting rather than uniform noise.

Synthetic data. Do not draw neuroscientific conclusions from it.

Usage:
  python3 scripts/generate-schaefer1000-data.py
  python3 scripts/generate-schaefer1000-data.py --sessions 3 --timepoints 300
"""
import argparse
import os
import sys
from pathlib import Path

import numpy as np
import requests

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "python" / "datasets" / "advanced_connectome"
OUT = ROOT / "datasets"
API_BASE = os.environ.get("BRAINFORGE_API", "http://localhost:3001")
HEADERS = {"Content-Type": "application/json", "X-Dev-User": "dev@brainforge.local"}

# Fraction of each region's variance from the global signal, its network, and noise.
GLOBAL_W, NETWORK_W, NOISE_W = 0.25, 0.45, 0.30


def load_regions(limit=None):
    names, networks = [], []
    with open(DATA / "coords.csv") as fh:
        for line in fh:
            parts = line.strip().split(",")
            if len(parts) < 5:
                continue
            names.append(parts[0])
            networks.append(parts[0].split()[0])
    if limit:
        names, networks = names[:limit], networks[:limit]
    return names, networks


def simulate(networks, n_timepoints, tr, seed):
    """Mixture of global, network-level and independent signals."""
    rng = np.random.default_rng(seed)
    n = len(networks)
    uniq = sorted(set(networks))
    net_idx = {k: i for i, k in enumerate(uniq)}

    def ar1(length, rho=0.6):
        """Autocorrelated noise — BOLD is smooth, not white."""
        x = np.zeros(length)
        e = rng.normal(0, 1, length)
        for t in range(1, length):
            x[t] = rho * x[t - 1] + np.sqrt(1 - rho ** 2) * e[t]
        return x

    global_sig = ar1(n_timepoints)
    net_sigs = np.array([ar1(n_timepoints) for _ in uniq])

    ts = np.empty((n_timepoints, n))
    for i, net in enumerate(networks):
        ts[:, i] = (np.sqrt(GLOBAL_W) * global_sig
                    + np.sqrt(NETWORK_W) * net_sigs[net_idx[net]]
                    + np.sqrt(NOISE_W) * ar1(n_timepoints))
    ts = (ts - ts.mean(0)) / (ts.std(0) + 1e-9)
    return ts


def register(name, description, fmt, region_count, path, metadata):
    try:
        r = requests.post(f"{API_BASE}/api/datasets", headers=HEADERS, timeout=30, json={
            "name": name, "description": description, "format": fmt,
            "source": "synthetic", "regionCount": region_count,
            "storagePath": str(path.relative_to(ROOT)),
            "fileSize": path.stat().st_size, "metadata": metadata,
        })
        r.raise_for_status()
        return r.json().get("id")
    except Exception as exc:
        print(f"    ! could not register {name}: {exc}")
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sessions", type=int, default=2)
    ap.add_argument("--timepoints", type=int, default=200)
    ap.add_argument("--tr", type=float, default=2.0)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--no-register", action="store_true")
    args = ap.parse_args()

    names, networks = load_regions(args.limit)
    n = len(names)
    OUT.mkdir(exist_ok=True)
    print(f"Schaefer-{n}: {len(set(networks))} networks, "
          f"{args.sessions} sessions x {args.timepoints} timepoints (TR={args.tr}s)")

    fcs = []
    for s in range(1, args.sessions + 1):
        ts = simulate(networks, args.timepoints, args.tr, seed=1000 + s)
        rest = OUT / f"schaefer_{n}_rest_session{s}.csv"
        np.savetxt(rest, ts, delimiter=",", fmt="%.5f",
                   header=",".join(names), comments="")
        fc = np.corrcoef(ts.T)
        fcs.append(fc)
        fcp = OUT / f"schaefer_{n}_fc_session{s}.csv"
        np.savetxt(fcp, fc, delimiter=",", fmt="%.5f",
                   header=",".join(names), comments="")
        print(f"  session {s}: {rest.name} ({rest.stat().st_size/1e6:.1f} MB), {fcp.name}")
        if not args.no_register:
            register(f"Schaefer-{n} Rest Session {s}",
                     f"Synthetic resting-state BOLD, {args.timepoints} volumes at TR={args.tr}s.",
                     "csv", n, rest, {"sessions": 1, "timepoints": args.timepoints, "tr": args.tr})
            register(f"Schaefer-{n} FC Session {s}",
                     f"Functional connectivity (Pearson) from rest session {s}.",
                     "csv", n, fcp, {"derivedFrom": rest.name})

    group = np.mean(fcs, axis=0)
    gp = OUT / f"schaefer_{n}_fc_group_average.csv"
    np.savetxt(gp, group, delimiter=",", fmt="%.5f", header=",".join(names), comments="")
    print(f"  group average: {gp.name}")
    if not args.no_register:
        register(f"Schaefer-{n} FC Group Average",
                 f"Mean functional connectivity across {args.sessions} sessions.",
                 "csv", n, gp, {"sessions": args.sessions})

    # Sanity check: within-network correlation should exceed between-network.
    uniq = sorted(set(networks))
    net_of = np.array([uniq.index(x) for x in networks])
    same = net_of[:, None] == net_of[None, :]
    off = ~np.eye(n, dtype=bool)
    within = group[same & off].mean()
    between = group[~same].mean()
    print(f"\n  within-network r = {within:.3f}, between-network r = {between:.3f}")
    print(f"  block structure present: {within > between + 0.1}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
