"""Experiment management, parameter sweeps, and batch runners."""

from .sweep import (
    ParameterSweep,
    SweepResult,
    grid_sweep,
    random_sweep,
)
from .templates import (
    baseline_experiment,
    perturbation_experiment,
    parameter_sweep_experiment,
)

__all__ = [
    "ParameterSweep",
    "SweepResult",
    "grid_sweep",
    "random_sweep",
    "baseline_experiment",
    "perturbation_experiment",
    "parameter_sweep_experiment",
]
from .closed_loop import (
    control_experiment,
    training_experiment,
    training_control_pair,
    CLOSED_LOOP_NETWORK_PARAMS,
    CLOSED_LOOP_PLASTICITY_PARAMS,
)
from .pong_env import (
    PredictivePongEnv,
    SpinPongEnv,
    policy_baselines,
)
