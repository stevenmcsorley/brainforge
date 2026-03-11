#!/usr/bin/env python3
"""Generate the sample connectome dataset.

This script creates:
  - regions.json   — 68 region definitions
  - weights.npz    — 68×68 connectivity matrix
  - weights.csv    — same matrix in CSV

Run from the brainforge root:
    python python/datasets/sample_connectome/generate.py

IMPORTANT: The data produced is SYNTHETIC. It is NOT derived from real
DTI tractography or empirical connectome data. It exists only to give
the simulation pipeline realistic-looking input for development and testing.
"""

import json
import csv
import sys
from pathlib import Path

import numpy as np

OUT = Path(__file__).parent

# ─── Region definitions ────────────────────────────────────────────────────
# 34 DK-parcellation cortical labels per hemisphere (simplified)
DK_LABELS = [
    ("Bankssts", "BSTS"),
    ("Caudalanteriorcingulate", "cACC"),
    ("Caudalmiddlefrontal", "CMF"),
    ("Cuneus", "CUN"),
    ("Entorhinal", "ENT"),
    ("Fusiform", "FUS"),
    ("Inferiorparietal", "IP"),
    ("Inferiortemporal", "IT"),
    ("Isthmuscingulate", "iCC"),
    ("Lateraloccipital", "LOG"),
    ("Lateralorbitofrontal", "LOF"),
    ("Lingual", "LIN"),
    ("Medialorbitofrontal", "MOF"),
    ("Middletemporal", "MT"),
    ("Parahippocampal", "PHC"),
    ("Paracentral", "PAR"),
    ("Parsopercularis", "POP"),
    ("Parsorbitalis", "POB"),
    ("Parstriangularis", "PTR"),
    ("Pericalcarine", "PCA"),
    ("Postcentral", "PSC"),
    ("Posteriorcingulate", "PCC"),
    ("Precentral", "PRC"),
    ("Precuneus", "PREC"),
    ("Rostralanteriorcingulate", "rACC"),
    ("Rostralmiddlefrontal", "RMF"),
    ("Superiorfrontal", "SF"),
    ("Superiorparietal", "SP"),
    ("Superiortemporal", "ST"),
    ("Supramarginal", "SMG"),
    ("Frontalpole", "FP"),
    ("Temporalpole", "TP"),
    ("Transversetemporal", "TT"),
    ("Insula", "INS"),
]

# Approximate MNI coordinates (x, y, z) for left hemisphere centroids
# These are ball-park atlas values, not precise
LEFT_COORDS = [
    (-47, -42, 12),   # Bankssts
    (-6,  30,  24),   # cACC
    (-41,  8,  50),   # CMF
    (-10,-82,  28),   # Cuneus
    (-27,-10, -28),   # Entorhinal
    (-38,-42, -20),   # Fusiform
    (-42,-68,  36),   # IP
    (-54,-22, -24),   # IT
    (-8, -48,  22),   # iCC
    (-36,-82,  12),   # LOG
    (-36,  40, -16),  # LOF
    (-14,-68,  4),    # Lingual
    (-6,  48, -14),   # MOF
    (-56,-20, -14),   # MT
    (-26,-36, -18),   # PHC
    (-8, -36,  68),   # Paracentral
    (-46, 12,  26),   # Parsopercularis
    (-38, 44, -16),   # Parsorbitalis
    (-46, 26,  14),   # Parstriangularis
    (-8, -80,   4),   # Pericalcarine
    (-42,-26,  52),   # Postcentral
    (-8, -52,  28),   # PCC
    (-42,-10,  56),   # Precentral
    (-8, -64,  42),   # Precuneus
    (-6,  34,  12),   # rACC
    (-26, 38,  38),   # RMF
    (-14, 34,  50),   # SF
    (-30,-60,  50),   # SP
    (-60,-16,   0),   # ST
    (-60,-40,  36),   # SMG
    (-2,  60,  -6),   # FP
    (-38,  8, -38),   # TP
    (-46,-20,  10),   # TT
    (-36, -8,   4),   # Insula
]

assert len(DK_LABELS) == 34
assert len(LEFT_COORDS) == 34

N = 68
regions = []
for i, ((name, abbr), (x, y, z)) in enumerate(zip(DK_LABELS, LEFT_COORDS)):
    regions.append({
        "id": f"r{i:03d}",
        "name": f"Left {name}",
        "abbreviation": f"L-{abbr}",
        "hemisphere": "left",
        "atlas_index": i,
        "x": float(x),
        "y": float(y),
        "z": float(z),
    })

for i, ((name, abbr), (x, y, z)) in enumerate(zip(DK_LABELS, LEFT_COORDS)):
    regions.append({
        "id": f"r{i+34:03d}",
        "name": f"Right {name}",
        "abbreviation": f"R-{abbr}",
        "hemisphere": "right",
        "atlas_index": i + 34,
        # Mirror across x-axis for right hemisphere
        "x": float(-x),
        "y": float(y),
        "z": float(z),
    })

# ─── Connectivity matrix ───────────────────────────────────────────────────
rng = np.random.default_rng(42)

coords = np.array([[r["x"], r["y"], r["z"]] for r in regions])  # (68, 3)

# Pairwise Euclidean distances
diff = coords[:, np.newaxis, :] - coords[np.newaxis, :, :]  # (N, N, 3)
distances = np.sqrt((diff ** 2).sum(axis=2))  # (N, N)

# Distance-dependent weight: exponential falloff + small baseline noise
sigma = 50.0  # mm
weights = np.exp(-distances / sigma)
np.fill_diagonal(weights, 0)  # no self-connections

# Add sparse long-range connections (interhemispheric homotopic)
for i in range(34):
    j = i + 34
    w = rng.uniform(0.05, 0.25)
    weights[i, j] = w
    weights[j, i] = w

# Add random sparse long-range connections (~5% density)
n_long = int(0.05 * N * N)
rows = rng.integers(0, N, size=n_long)
cols = rng.integers(0, N, size=n_long)
for r, c in zip(rows, cols):
    if r != c:
        weights[r, c] = max(weights[r, c], rng.uniform(0.01, 0.15))

# Normalise to [0, 1]
weights = weights / weights.max()

# ─── Save ──────────────────────────────────────────────────────────────────
OUT.mkdir(parents=True, exist_ok=True)

# regions.json
(OUT / "regions.json").write_text(json.dumps(regions, indent=2))
print(f"Written {len(regions)} regions → {OUT / 'regions.json'}")

# weights.npz
region_names = np.array([r["abbreviation"] for r in regions], dtype=object)
np.savez_compressed(
    OUT / "weights.npz",
    weights=weights,
    region_names=region_names,
)
print(f"Written ({N}×{N}) weight matrix → {OUT / 'weights.npz'}")

# weights.csv
with open(OUT / "weights.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow([r["abbreviation"] for r in regions])  # header
    for row in weights:
        writer.writerow([f"{w:.6f}" for w in row])
print(f"Written ({N}×{N}) weight matrix → {OUT / 'weights.csv'}")

print("\n✓ Sample connectome dataset generated successfully.")
print(f"  Regions: {N}  |  Sparsity: {(weights > 0.01).sum() / N**2 * 100:.1f}%  |  Weight range: [{weights.min():.3f}, {weights.max():.3f}]")
