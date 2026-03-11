"""Experiment template factories.

These functions produce fully-formed experiment config dicts
that can be passed to the API or used directly in the Python engine.
They are named after the scientific protocol they represent.
"""

from typing import Any, Dict, List, Optional


def baseline_experiment(
    model_id: str,
    backend: str = "rate_based",
    duration: float = 2.0,
    dt: float = 0.001,
    seed: int = 42,
    name: str = "Baseline",
    description: str = "Unperturbed resting-state simulation",
    tags: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """A standard baseline (no stimulation, resting state) experiment config."""
    return {
        "name": name,
        "description": description,
        "modelId": model_id,
        "tags": tags or ["baseline"],
        "config": {
            "backend": backend,
            "duration": duration,
            "dt": dt,
            "seed": seed,
            "reportInterval": 100,
            "parameters": {},
            "stimuli": [],
        },
    }


def perturbation_experiment(
    model_id: str,
    target_regions: List[int],
    amplitude: float = 0.5,
    stim_start: float = 0.5,
    stim_end: float = 1.5,
    backend: str = "rate_based",
    duration: float = 3.0,
    dt: float = 0.001,
    seed: int = 42,
    name: str = "Perturbation",
    description: str = "Focal stimulation of target regions",
    tags: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Single-region focal stimulation experiment.
    
    Applies a constant stimulus to `target_regions` during the perturbation window.
    """
    return {
        "name": name,
        "description": description,
        "modelId": model_id,
        "tags": tags or ["perturbation", "stimulation"],
        "config": {
            "backend": backend,
            "duration": duration,
            "dt": dt,
            "seed": seed,
            "reportInterval": 100,
            "parameters": {},
            "stimuli": [
                {
                    "type": "constant",
                    "targets": target_regions,
                    "amplitude": amplitude,
                    "startTime": stim_start,
                    "endTime": stim_end,
                }
            ],
        },
    }


def parameter_sweep_experiment(
    model_id: str,
    sweep_parameter: str,
    sweep_values: List[Any],
    backend: str = "rate_based",
    duration: float = 2.0,
    dt: float = 0.001,
    base_seed: int = 42,
    name: str = "Parameter Sweep",
    description: str = "Sweep over a single parameter",
    tags: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Generate a parameter sweep experiment definition.
    
    Each point in `sweep_values` becomes a separate run with the
    given `sweep_parameter` set to that value.
    
    The returned config should be used to create multiple runs,
    one per sweep point.
    """
    return {
        "name": name,
        "description": description,
        "modelId": model_id,
        "tags": tags or ["sweep", sweep_parameter],
        "sweepConfig": {
            "axes": {sweep_parameter: sweep_values},
            "baseConfig": {
                "backend": backend,
                "duration": duration,
                "dt": dt,
                "seed": base_seed,
                "reportInterval": 100,
                "parameters": {},
                "stimuli": [],
            },
        },
    }
