"""Analysis utilities for post-processing simulation outputs.

Provides functions for:
- time-series metrics (mean, variance, autocorrelation)
- functional connectivity computation
- spectral analysis (power spectrum, dominant frequency)
- phase-based synchrony (Kuramoto order parameter)
- instability / divergence detection
- run comparison utilities
"""

from .metrics import (
    compute_mean_activity,
    compute_variance,
    compute_autocorrelation,
    compute_functional_connectivity,
    compute_power_spectrum,
    compute_dominant_frequency,
    compute_kuramoto_order,
    compute_pairwise_correlation,
    detect_instability,
)
from .compare import (
    compare_runs,
    compute_run_distance,
    summarise_run,
)

__all__ = [
    "compute_mean_activity",
    "compute_variance",
    "compute_autocorrelation",
    "compute_functional_connectivity",
    "compute_power_spectrum",
    "compute_dominant_frequency",
    "compute_kuramoto_order",
    "compute_pairwise_correlation",
    "detect_instability",
    "compare_runs",
    "compute_run_distance",
    "summarise_run",
]
