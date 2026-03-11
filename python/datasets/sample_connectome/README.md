# BRAINFORGE — Sample Connectome Dataset

This directory contains a simplified synthetic connectome loosely based on the
Desikan-Killiany parcellation (34 regions per hemisphere = 68 total cortical ROIs).

## Files

| File | Description |
|---|---|
| `regions.json` | 68 region definitions with coordinates and hemisphere labels |
| `weights.npz` | 68×68 connectivity weight matrix (synthetic, distance-dependent) |
| `weights.csv` | Same matrix in CSV format for inspection |
| `metadata.json` | Dataset provenance and schema description |

## Important Caveats

- Connectivity weights are **synthetic** — they follow a distance-dependent
  exponential falloff with some added long-range connections.
- This is **not** derived from actual DTI/tractography data.
- Coordinates are approximate atlas centroids, not real MNI coordinates.
- This dataset exists only to validate the simulation pipeline works end-to-end.

## Schema

### regions.json
```json
[
  {
    "id": "r000",
    "name": "Left Bankssts",
    "abbreviation": "L-BSTS",
    "hemisphere": "left",
    "atlas_index": 0,
    "x": -47.0, "y": -42.0, "z": 12.0
  },
  ...
]
```

### weights.npz keys
- `weights` — float64 array of shape (68, 68), normalised [0, 1]
- `region_names` — 68-element string array of region abbreviations

## Usage
```python
import numpy as np
from engine.io import load_connectivity_npz, load_region_metadata_json

weights = load_connectivity_npz("python/datasets/sample_connectome/weights.npz")
regions = load_region_metadata_json("python/datasets/sample_connectome/regions.json")
```
