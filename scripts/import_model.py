#!/usr/bin/env python3
"""
BrainForge Model Importer
=========================
Import brain connectivity models from multiple formats into BrainForge.

Supported formats:
  - TheVirtualBrain (TVB) .zip files
  - NumPy weight matrix (.npy) + centres file (.txt or .csv)
  - CSV edge list (source, target, weight)
  - Generic NxN weight matrix CSV

Usage:
  python3 import_model.py --format tvb   --input path/to/tvb.zip    --name "My TVB Model"
  python3 import_model.py --format numpy --weights W.npy --centres centres.txt --name "HCP 80"
  python3 import_model.py --format csv   --input edges.csv           --name "Custom Atlas"
  python3 import_model.py --format matrix --input weights.csv --coords coords.csv --name "AAL90"

Requirements:
  pip install numpy requests

Optional (for TVB format):
  pip install tvb-library
"""

import argparse
import json
import os
import sys
import zipfile
from pathlib import Path

import numpy as np
import requests

API_BASE = os.environ.get("BRAINFORGE_API_URL", "http://localhost:3001")
API_HEADERS = {
    "Content-Type": "application/json",
    "X-Dev-User": "dev@brainforge.local",
}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def create_model(name: str, description: str, backend: str = "rate_based") -> str:
    """Create the BrainModel record and return its ID."""
    resp = requests.post(
        f"{API_BASE}/api/models",
        headers=API_HEADERS,
        json={"name": name, "description": description, "defaultBackend": backend, "parameters": {
            "tau": 0.01, "gain": 1.0, "noise_sigma": 0.02, "global_coupling": 0.5
        }},
        timeout=10,
    )
    resp.raise_for_status()
    model_id = resp.json()["id"]
    print(f"  Created model: {model_id}")
    return model_id


def upload_regions_and_connections(model_id: str, regions: list, connections: list):
    """POST regions + connections to the bulk import endpoint."""
    print(f"  Uploading {len(regions)} regions, {len(connections)} connections...")
    resp = requests.post(
        f"{API_BASE}/api/models/{model_id}/import",
        headers=API_HEADERS,
        json={"regions": regions, "connections": connections},
        timeout=120,
    )
    resp.raise_for_status()
    result = resp.json()
    print(f"  ✅ Imported: {result['regionsCreated']} regions, {result['connectionsCreated']} connections")
    return result


def build_connections_from_matrix(weight_matrix: np.ndarray, threshold: float = 0.0, 
                                   tract_lengths: np.ndarray = None) -> list:
    """Convert an NxN weight matrix to a connection list."""
    n = weight_matrix.shape[0]
    connections = []
    for i in range(n):
        for j in range(n):
            w = float(weight_matrix[i, j])
            if w > threshold:
                delay = float(tract_lengths[i, j]) if tract_lengths is not None else 0.0
                connections.append({
                    "sourceIndex": i,
                    "targetIndex": j,
                    "weight": round(w, 6),
                    "delay": round(delay, 4),
                })
    return connections


# ─── TVB format ───────────────────────────────────────────────────────────────

def parse_tvb_zip(zip_path: str) -> tuple[list, list]:
    """
    Parse a TheVirtualBrain connectivity .zip file.

    TVB zip structure:
      weights.txt     - NxN weight matrix (space/tab separated)
      tract_lengths.txt - NxN tract length matrix (in mm)
      centres.txt     - N rows: name x y z
      areas.txt       - N rows: region surface area (optional)
      cortical.txt    - N rows: 0/1 cortical flag (optional)
      hemisphere.txt  - "L"/"R" per region (optional, or encoded in name)
    """
    print(f"  Parsing TVB zip: {zip_path}")
    with zipfile.ZipFile(zip_path, "r") as zf:
        names_in_zip = zf.namelist()

        def read_txt(filename):
            for n in names_in_zip:
                if n.endswith(filename):
                    with zf.open(n) as f:
                        return f.read().decode("utf-8").strip()
            return None

        weights_txt = read_txt("weights.txt")
        centres_txt = read_txt("centres.txt")
        tract_txt = read_txt("tract_lengths.txt")
        hemi_txt = read_txt("hemisphere.txt")

    if not weights_txt or not centres_txt:
        raise ValueError("TVB zip must contain weights.txt and centres.txt")

    # Parse weight matrix
    weight_matrix = np.array([
        [float(x) for x in line.split()]
        for line in weights_txt.splitlines()
    ])

    # Parse tract lengths
    tract_lengths = None
    if tract_txt:
        tract_lengths = np.array([
            [float(x) for x in line.split()]
            for line in tract_txt.splitlines()
        ])

    # Parse centres: "name x y z" or "name label x y z"
    regions = []
    hemisphere_map = []
    if hemi_txt:
        hemisphere_map = [line.strip().upper() for line in hemi_txt.splitlines()]

    for i, line in enumerate(centres_txt.splitlines()):
        parts = line.strip().split()
        if len(parts) < 4:
            continue
        name = parts[0]
        # Guess hemisphere from name prefix (L_ / R_ or lh_ / rh_)
        hemi = None
        name_lower = name.lower()
        if hemisphere_map and i < len(hemisphere_map):
            hemi = "left" if hemisphere_map[i] == "L" else "right"
        elif name_lower.startswith(("l_", "lh_", "left_", "l.")):
            hemi = "left"
        elif name_lower.startswith(("r_", "rh_", "right_", "r.")):
            hemi = "right"

        regions.append({
            "name": name,
            "abbreviation": name[:8],
            "hemisphere": hemi,
            "atlasIndex": i,
            "coordX": float(parts[1]),
            "coordY": float(parts[2]),
            "coordZ": float(parts[3]),
        })

    # Normalise weights to [0, 1]
    w_max = weight_matrix.max()
    if w_max > 0:
        weight_matrix = weight_matrix / w_max

    connections = build_connections_from_matrix(weight_matrix, threshold=1e-6, tract_lengths=tract_lengths)
    print(f"  TVB: {len(regions)} regions, {len(connections)} non-zero connections")
    return regions, connections


# ─── NumPy format ─────────────────────────────────────────────────────────────

def parse_numpy(weights_path: str, centres_path: str, tracts_path: str = None) -> tuple[list, list]:
    """
    Parse a NumPy weight matrix + centres file.

    weights_path: .npy file, NxN float matrix
    centres_path: .txt or .csv with rows: name x y z [hemisphere]
    tracts_path : optional .npy for tract lengths
    """
    print(f"  Loading NumPy weights: {weights_path}")
    weight_matrix = np.load(weights_path)
    assert weight_matrix.ndim == 2 and weight_matrix.shape[0] == weight_matrix.shape[1], \
        "Weight matrix must be square NxN"

    tract_lengths = np.load(tracts_path) if tracts_path else None

    # Normalise
    w_max = weight_matrix.max()
    if w_max > 0:
        weight_matrix = weight_matrix / w_max

    # Parse centres
    regions = []
    with open(centres_path) as f:
        for i, line in enumerate(f):
            parts = line.strip().split(",") if "," in line else line.strip().split()
            if len(parts) < 4:
                continue
            name = parts[0]
            hemi = None
            if len(parts) >= 5:
                h = parts[4].strip().lower()
                hemi = "left" if h in ("l", "left", "lh") else "right" if h in ("r", "right", "rh") else None
            elif name.lower().startswith(("l_", "lh_")):
                hemi = "left"
            elif name.lower().startswith(("r_", "rh_")):
                hemi = "right"

            regions.append({
                "name": name,
                "abbreviation": name[:8],
                "hemisphere": hemi,
                "atlasIndex": i,
                "coordX": float(parts[1]),
                "coordY": float(parts[2]),
                "coordZ": float(parts[3]),
            })

    connections = build_connections_from_matrix(weight_matrix, threshold=1e-6, tract_lengths=tract_lengths)
    print(f"  NumPy: {len(regions)} regions, {len(connections)} connections")
    return regions, connections


# ─── CSV edge list format ──────────────────────────────────────────────────────

def parse_csv_edges(csv_path: str, coords_path: str = None) -> tuple[list, list]:
    """
    Parse a CSV edge list: source_name, target_name, weight[, delay]
    Optionally a coords CSV: name, x, y, z[, hemisphere]
    """
    import csv

    print(f"  Loading CSV edges: {csv_path}")
    name_to_idx: dict[str, int] = {}
    connections_raw = []

    with open(csv_path) as f:
        reader = csv.reader(f)
        header = next(reader, None)
        for row in reader:
            if len(row) < 3:
                continue
            src, tgt, w = row[0].strip(), row[1].strip(), float(row[2])
            delay = float(row[3]) if len(row) > 3 else 0.0
            for name in (src, tgt):
                if name not in name_to_idx:
                    name_to_idx[name] = len(name_to_idx)
            connections_raw.append((src, tgt, w, delay))

    # Build regions list
    region_names = [None] * len(name_to_idx)
    for name, idx in name_to_idx.items():
        region_names[idx] = name

    coords_lookup: dict[str, tuple] = {}
    if coords_path:
        with open(coords_path) as f:
            for line in f:
                parts = line.strip().split(",") if "," in line else line.strip().split()
                if len(parts) >= 4:
                    coords_lookup[parts[0].strip()] = (
                        float(parts[1]), float(parts[2]), float(parts[3]),
                        parts[4].strip().lower() if len(parts) > 4 else None,
                    )

    regions = []
    for i, name in enumerate(region_names):
        cx, cy, cz, hemi = coords_lookup.get(name, (0.0, 0.0, 0.0, None))
        if hemi:
            hemi = "left" if hemi in ("l", "left", "lh") else "right"
        regions.append({
            "name": name,
            "abbreviation": name[:8],
            "hemisphere": hemi,
            "atlasIndex": i,
            "coordX": cx, "coordY": cy, "coordZ": cz,
        })

    connections = [
        {"sourceIndex": name_to_idx[s], "targetIndex": name_to_idx[t], "weight": w, "delay": d}
        for s, t, w, d in connections_raw
    ]
    print(f"  CSV: {len(regions)} regions, {len(connections)} connections")
    return regions, connections


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    global API_BASE
    
    parser = argparse.ArgumentParser(
        description="Import a brain model into BrainForge",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--format", required=True, choices=["tvb", "numpy", "csv", "matrix"],
                        help="Input format")
    parser.add_argument("--name", required=True, help="Model name in BrainForge")
    parser.add_argument("--description", default="", help="Model description")
    parser.add_argument("--backend", default="rate_based", choices=["rate_based", "spiking", "whole_brain"])
    parser.add_argument("--input", help="Primary input file (.zip for TVB, .npy for matrix, .csv for edges)")
    parser.add_argument("--weights", help="NumPy: path to weights .npy")
    parser.add_argument("--centres", "--coords", help="Centres/coordinates file (.txt or .csv)")
    parser.add_argument("--tracts", help="NumPy: path to tract_lengths .npy (optional)")
    parser.add_argument("--threshold", type=float, default=0.001, help="Min weight threshold (default 0.001)")
    parser.add_argument("--api", default=API_BASE, help=f"API base URL (default: {API_BASE})")
    parser.add_argument("--dry-run", action="store_true", help="Parse only — don't upload")
    args = parser.parse_args()

    API_BASE = args.api

    print(f"\n🧠 BrainForge Model Importer")
    print(f"   Format : {args.format}")
    print(f"   Name   : {args.name}")
    print(f"   API    : {API_BASE}\n")

    # Parse
    if args.format == "tvb":
        if not args.input:
            parser.error("--input required for tvb format")
        regions, connections = parse_tvb_zip(args.input)

    elif args.format == "numpy":
        if not args.weights or not args.centres:
            parser.error("--weights and --centres required for numpy format")
        regions, connections = parse_numpy(args.weights, args.centres, args.tracts)

    elif args.format == "csv":
        if not args.input:
            parser.error("--input required for csv format")
        regions, connections = parse_csv_edges(args.input, args.centres)

    elif args.format == "matrix":
        # NxN CSV matrix + optional coords CSV
        if not args.input:
            parser.error("--input required for matrix format")
        import csv as csvmod
        print(f"  Loading NxN CSV matrix: {args.input}")
        rows = []
        with open(args.input) as f:
            for line in f:
                parts = line.strip().split(",") if "," in line else line.strip().split()
                rows.append([float(x) for x in parts])
        weight_matrix = np.array(rows)
        # Make regions from CSV coords or generic names
        n = weight_matrix.shape[0]
        if args.centres:
            coords_data = []
            with open(args.centres) as f:
                for line in f:
                    parts = line.strip().split(",") if "," in line else line.strip().split()
                    coords_data.append(parts)
        else:
            coords_data = [[f"Region_{i:03d}", "0", "0", "0"] for i in range(n)]

        w_max = weight_matrix.max()
        if w_max > 0:
            weight_matrix = weight_matrix / w_max

        regions = []
        for i in range(n):
            p = coords_data[i] if i < len(coords_data) else [f"Region_{i}", "0", "0", "0"]
            name = p[0]
            hemi = None
            if name.lower().startswith(("l_", "lh_")): hemi = "left"
            elif name.lower().startswith(("r_", "rh_")): hemi = "right"
            regions.append({
                "name": name, "abbreviation": name[:8],
                "hemisphere": hemi, "atlasIndex": i,
                "coordX": float(p[1]) if len(p) > 1 else 0.0,
                "coordY": float(p[2]) if len(p) > 2 else 0.0,
                "coordZ": float(p[3]) if len(p) > 3 else 0.0,
            })
        connections = build_connections_from_matrix(weight_matrix, threshold=args.threshold)
        print(f"  Matrix: {len(regions)} regions, {len(connections)} connections")

    # Filter by threshold
    connections = [c for c in connections if c["weight"] >= args.threshold]
    print(f"  After threshold ({args.threshold}): {len(connections)} connections")

    if args.dry_run:
        print("\n[Dry run] First 3 regions:")
        for r in regions[:3]:
            print(f"  {json.dumps(r)}")
        print(f"[Dry run] First 3 connections:")
        for c in connections[:3]:
            print(f"  {json.dumps(c)}")
        print("\n✅ Dry run complete — nothing uploaded.")
        return

    # Upload
    print("\nUploading to BrainForge...")
    model_id = create_model(args.name, args.description, args.backend)
    result = upload_regions_and_connections(model_id, regions, connections)

    print(f"\n{'='*50}")
    print(f"✅ Model imported successfully!")
    print(f"   Model ID       : {model_id}")
    print(f"   Regions        : {result['regionsCreated']}")
    print(f"   Connections    : {result['connectionsCreated']}")
    print(f"\n   Open in BrainForge:")
    print(f"   http://localhost:5173/models")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    main()
