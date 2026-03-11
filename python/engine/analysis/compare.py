"""Run comparison utilities.

Compare two or more simulation runs by loading their artifacts
and computing distance/similarity metrics between them.
"""

import json
import numpy as np
from pathlib import Path
from typing import Dict, Any, List, Optional

from .metrics import (
    compute_mean_activity,
    compute_variance,
    compute_functional_connectivity,
    compute_dominant_frequency,
    detect_instability,
)


def _load_traces(run_path: Path) -> Optional[np.ndarray]:
    """Load activity traces from a run storage path. Returns shape (T, N) or None."""
    trace_file = run_path / "traces" / "activity_traces.npz"
    if not trace_file.exists():
        return None
    data = np.load(trace_file)
    return data["traces"]  # shape (T, N)


def _load_metrics(run_path: Path) -> List[Dict]:
    """Load metrics JSON from a run storage path."""
    metrics_file = run_path / "metrics.json"
    if not metrics_file.exists():
        return []
    return json.loads(metrics_file.read_text())


def summarise_run(run_path: str, dt: float = 0.001) -> Dict[str, Any]:
    """Compute a concise summary dict for a single run.
    
    Args:
        run_path: path to the run storage directory
        dt: simulation time step (seconds)
    Returns:
        dict with summary metrics.
    """
    path = Path(run_path)
    traces = _load_traces(path)
    metrics_history = _load_metrics(path)

    if traces is None and not metrics_history:
        return {"error": "No data found", "path": run_path}

    summary: Dict[str, Any] = {}

    if traces is not None and traces.shape[0] > 0:
        summary["n_regions"] = traces.shape[1]
        summary["n_steps"] = traces.shape[0]
        summary["mean_activity"] = float(np.mean(traces))
        summary["std_activity"] = float(np.std(traces))
        summary["max_activity"] = float(np.max(np.abs(traces)))

        per_region_mean = compute_mean_activity(traces)
        per_region_var = compute_variance(traces)
        summary["top_active_regions"] = list(
            np.argsort(per_region_mean)[-5:][::-1].tolist()
        )
        summary["top_variable_regions"] = list(
            np.argsort(per_region_var)[-5:][::-1].tolist()
        )

        # Dominant frequency of mean signal
        mean_trace = np.mean(traces, axis=1)
        summary["dominant_freq_hz"] = compute_dominant_frequency(mean_trace, dt)

        # Stability check
        stability = detect_instability(traces)
        summary["is_stable"] = stability["is_stable"]
        summary["n_saturated"] = len(stability["saturated_regions"])
        summary["n_collapsed"] = len(stability["collapsed_regions"])

    if metrics_history:
        mean_acts = [m.get("mean_activity", 0) for m in metrics_history]
        summary.setdefault("mean_activity", float(np.mean(mean_acts)))
        summary["final_mean_activity"] = float(mean_acts[-1]) if mean_acts else 0.0

    return summary


def compare_runs(
    run_path_a: str,
    run_path_b: str,
    dt: float = 0.001,
) -> Dict[str, Any]:
    """Compare two runs, returning similarity metrics and per-run summaries.
    
    Args:
        run_path_a: path to first run storage directory
        run_path_b: path to second run storage directory
        dt: simulation time step in seconds
    Returns:
        Comparison dict with per-run summaries and cross-run metrics.
    """
    path_a = Path(run_path_a)
    path_b = Path(run_path_b)

    traces_a = _load_traces(path_a)
    traces_b = _load_traces(path_b)

    summary_a = summarise_run(run_path_a, dt)
    summary_b = summarise_run(run_path_b, dt)

    result: Dict[str, Any] = {
        "run_a": summary_a,
        "run_b": summary_b,
    }

    if traces_a is None or traces_b is None:
        result["error"] = "Could not load traces for one or both runs"
        return result

    # Align lengths to the shorter run
    T = min(traces_a.shape[0], traces_b.shape[0])
    N = min(traces_a.shape[1], traces_b.shape[1])
    a = traces_a[:T, :N]
    b = traces_b[:T, :N]

    # Mean squared error between activity traces
    mse = float(np.mean((a - b) ** 2))
    result["mse"] = mse

    # Correlation between mean activity time series
    mean_a = np.mean(a, axis=1)
    mean_b = np.mean(b, axis=1)
    if mean_a.std() > 0 and mean_b.std() > 0:
        corr = float(np.corrcoef(mean_a, mean_b)[0, 1])
    else:
        corr = 0.0
    result["mean_activity_correlation"] = corr

    # FC matrix similarity (Frobenius norm of difference)
    fc_a = compute_functional_connectivity(a)
    fc_b = compute_functional_connectivity(b)
    fc_diff = float(np.linalg.norm(fc_a - fc_b, "fro"))
    result["fc_matrix_diff_frobenius"] = fc_diff

    return result


def compute_run_distance(traces_a: np.ndarray, traces_b: np.ndarray) -> float:
    """Compute a scalar distance between two (T, N) activity arrays.
    
    Uses normalised mean squared error of the mean activity traces.
    Returns a value in [0, inf) where 0 = identical.
    """
    T = min(traces_a.shape[0], traces_b.shape[0])
    N = min(traces_a.shape[1], traces_b.shape[1])
    a = np.mean(traces_a[:T, :N], axis=1)
    b = np.mean(traces_b[:T, :N], axis=1)
    return float(np.mean((a - b) ** 2))
