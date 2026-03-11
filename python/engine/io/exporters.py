"""Artifact exporters — save simulation outputs in standard formats."""

import csv
import json
from pathlib import Path
from typing import List, Dict, Any

import numpy as np


def export_traces_npz(
    traces: np.ndarray,
    region_names: List[str],
    output_path: str,
    dt: float = 0.001,
) -> str:
    """Save activity traces to a compressed NPZ file.
    
    Args:
        traces: shape (T, N)
        region_names: list of N region name strings
        output_path: destination file path (should end in .npz)
        dt: simulation time step in seconds
    Returns:
        Absolute path of the saved file.
    """
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    T = traces.shape[0]
    timestamps = np.arange(T) * dt
    np.savez_compressed(
        path,
        traces=traces,
        timestamps=timestamps,
        region_names=np.array(region_names, dtype=object),
    )
    return str(path.resolve())


def export_metrics_json(
    metrics: List[Dict[str, Any]],
    output_path: str,
) -> str:
    """Save run metrics history to a JSON file.
    
    Args:
        metrics: list of metric dicts (one per report step)
        output_path: destination file path
    Returns:
        Absolute path of the saved file.
    """
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(metrics, indent=2))
    return str(path.resolve())


def export_metrics_csv(
    metrics: List[Dict[str, Any]],
    output_path: str,
) -> str:
    """Save run metrics history to a CSV file.
    
    Args:
        metrics: list of metric dicts with consistent keys
        output_path: destination file path
    Returns:
        Absolute path of the saved file.
    """
    if not metrics:
        return output_path

    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(metrics[0].keys())

    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(metrics)

    return str(path.resolve())


def export_summary_json(
    summary: Dict[str, Any],
    output_path: str,
) -> str:
    """Save a run summary dict to JSON.
    
    The summary typically includes status, step counts, wall time,
    mean activity, warnings, and errors.
    """
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(summary, indent=2))
    return str(path.resolve())
