#!/usr/bin/env python3
import sys
import subprocess
import os
from pathlib import Path

# Auto-install requirements
try:
    import nilearn
    import numpy as np
except ImportError:
    print("Installing nilearn and numpy...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "nilearn", "numpy", "nibabel", "scipy", "requests"])
    import nilearn
    from nilearn import datasets, plotting
    import numpy as np

from nilearn import datasets, plotting

OUT = Path(__file__).parent
OUT.mkdir(exist_ok=True)

print("Fetching Schaefer 2018 400-node parcellation...")
dataset = datasets.fetch_atlas_schaefer_2018(n_rois=400, resolution_mm=2)
atlas_filename = dataset.maps
labels = dataset.labels

print("Calculating region centers from atlas...")
coords = plotting.find_parcellation_cut_coords(atlas_filename)
assert len(coords) == 400

labels = [l.decode() if isinstance(l, bytes) else str(l) for l in labels]
if labels[0] == "Background":
    labels = labels[1:]
assert len(labels) == 400

# Generate distance-based synthetic weights
print("Generating synthetic small-world connectivity...")
rng = np.random.default_rng(42)
diff = coords[:, np.newaxis, :] - coords[np.newaxis, :, :]
distances = np.sqrt((diff ** 2).sum(axis=2))

sigma = 40.0 # mm
weights = np.exp(-distances / sigma)
np.fill_diagonal(weights, 0)

# Add sparse long-range connections
n_long = int(0.04 * 400 * 400)
rows = rng.integers(0, 400, size=n_long)
cols = rng.integers(0, 400, size=n_long)
for r, c in zip(rows, cols):
    if r != c:
        weights[r, c] = max(weights[r, c], rng.uniform(0.01, 0.1))

weights = weights / weights.max()

# Write CSVs
coords_csv = OUT / "coords.csv"
weights_csv = OUT / "weights.csv"

with open(coords_csv, "w") as f:
    for i, label in enumerate(labels):
        name = label
        name = name.replace("7Networks_", "").replace("_", " ")
        hemi = "left" if name.startswith("LH") else "right" if name.startswith("RH") else "none"
        name = name[3:] if name.startswith(("LH ", "RH ")) else name
        f.write(f"{name},{coords[i][0]},{coords[i][1]},{coords[i][2]},{hemi}\n")

with open(weights_csv, "w") as f:
    for row in weights:
        f.write(",".join(f"{w:.6f}" for w in row) + "\n")

print(f"Generated {coords_csv} and {weights_csv}")

# Import to BrainForge
import_script = Path(__file__).parents[3] / "scripts" / "import_model.py"
print("Importing into BrainForge...")
cmd = [
    sys.executable, str(import_script),
    "--format", "matrix",
    "--input", str(weights_csv),
    "--coords", str(coords_csv),
    "--name", "Schaefer 400 Synthetic",
    "--description", "Advanced 400-region cortical parcellation (Schaefer et al. 2018) with synthetic small-world connectivity based on MNI coordinates.",
    "--backend", "rate_based"
]
subprocess.check_call(cmd)
print("Done!")
