"""Dataset and run artifact loaders.

These functions convert external data formats (CSV, NPZ, JSON)
into the internal engine types used by simulation backends.
"""

import json
import numpy as np
from pathlib import Path
from typing import Optional, Dict, Any, List

from engine.core.types import BrainModel, Region, Connection, SimConfig


def load_connectivity_csv(
    path: str,
    delimiter: str = ",",
    dtype: np.dtype = np.float64,
) -> np.ndarray:
    """Load a connectivity matrix from a CSV file.
    
    The file should be an N×N matrix of numeric weights.
    Returns shape (N, N).
    """
    return np.loadtxt(path, delimiter=delimiter, dtype=dtype)


def load_connectivity_npz(path: str, key: str = "weights") -> np.ndarray:
    """Load a connectivity matrix from an NPZ archive.
    
    Args:
        path: path to .npz file
        key: array key inside the archive (default: 'weights')
    Returns:
        2D numpy array of shape (N, N).
    """
    data = np.load(path)
    if key not in data:
        available = list(data.files)
        raise KeyError(f"Key '{key}' not found in {path}. Available: {available}")
    return data[key]


def load_region_metadata_json(path: str) -> List[Dict[str, Any]]:
    """Load region metadata from a JSON file.
    
    Expected format::
    
        [
          {"id": "r000", "name": "Region A", "hemisphere": "left",
           "atlas_index": 0, "x": 10.0, "y": -5.0, "z": 20.0},
          ...
        ]
    
    Returns list of dicts, one per region.
    """
    return json.loads(Path(path).read_text())


def load_brain_model_from_api(payload: Dict[str, Any]) -> BrainModel:
    """Construct a BrainModel from an API response payload.
    
    The payload is the JSON returned by GET /api/models/:id/full
    which includes regions and connections.
    """
    regions = [
        Region(
            id=r["id"],
            name=r["name"],
            hemisphere=r.get("hemisphere"),
            atlas_index=r.get("atlasIndex"),
            coord_x=r.get("coordX"),
            coord_y=r.get("coordY"),
            coord_z=r.get("coordZ"),
            metadata=r.get("metadata", {}),
        )
        for r in payload.get("regions", [])
    ]

    # Build region index map for O(1) lookup
    region_idx = {r.id: i for i, r in enumerate(regions)}
    n = len(regions)
    weights = np.zeros((n, n), dtype=np.float64)

    for conn in payload.get("connections", []):
        src_id = conn.get("sourceRegionId") or conn.get("source_region_id")
        tgt_id = conn.get("targetRegionId") or conn.get("target_region_id")
        if src_id in region_idx and tgt_id in region_idx:
            i = region_idx[src_id]
            j = region_idx[tgt_id]
            weights[i, j] = float(conn.get("weight", 0))

    connections = [
        Connection(
            source_idx=region_idx[conn.get("sourceRegionId") or conn.get("source_region_id")],
            target_idx=region_idx[conn.get("targetRegionId") or conn.get("target_region_id")],
            weight=float(conn.get("weight", 0)),
            delay=float(conn.get("delay", 0)),
        )
        for conn in payload.get("connections", [])
        if (conn.get("sourceRegionId") or conn.get("source_region_id")) in region_idx
        and (conn.get("targetRegionId") or conn.get("target_region_id")) in region_idx
    ]

    return BrainModel(
        id=payload["id"],
        name=payload["name"],
        regions=regions,
        connections=connections,
        weights=weights,
        metadata=payload.get("parameters", {}),
    )


def load_sim_config_from_dict(data: Dict[str, Any]) -> SimConfig:
    """Construct a SimConfig from a dict (e.g. experiment config JSON field)."""
    return SimConfig(
        backend=data.get("backend", "rate_based"),
        duration=float(data.get("duration", 1.0)),
        dt=float(data.get("dt", 0.001)),
        seed=int(data.get("seed", 42)),
        report_interval=int(data.get("reportInterval", data.get("report_interval", 100))),
        checkpoint_interval=data.get("checkpointInterval") or data.get("checkpoint_interval"),
        parameters=data.get("parameters", {}),
        stimuli=[],  # stimuli loaded separately
    )
