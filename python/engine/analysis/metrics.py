"""Analysis metrics for post-simulation processing.

All functions accept numpy arrays. The convention for activity arrays is:
  shape (T, N) — T time steps, N brain regions.
"""

import numpy as np
from typing import Tuple, Optional


def compute_mean_activity(traces: np.ndarray) -> np.ndarray:
    """Mean activity per region over time. Returns shape (N,)."""
    return np.mean(traces, axis=0)


def compute_variance(traces: np.ndarray) -> np.ndarray:
    """Activity variance per region over time. Returns shape (N,)."""
    return np.var(traces, axis=0)


def compute_autocorrelation(trace: np.ndarray, max_lag: int = 100) -> np.ndarray:
    """Compute normalised autocorrelation for a 1D trace up to `max_lag`.
    
    Returns array of shape (max_lag + 1,).
    """
    n = len(trace)
    trace = trace - trace.mean()
    var = np.dot(trace, trace)
    if var == 0:
        return np.zeros(max_lag + 1)
    result = np.array([
        np.dot(trace[:n - lag], trace[lag:]) / var
        for lag in range(max_lag + 1)
    ])
    return result


def compute_functional_connectivity(traces: np.ndarray) -> np.ndarray:
    """Compute pairwise Pearson correlation matrix from activity traces.
    
    Args:
        traces: shape (T, N)
    Returns:
        FC matrix of shape (N, N) with values in [-1, 1].
    """
    if traces.shape[0] < 2:
        N = traces.shape[1]
        return np.eye(N)
    return np.corrcoef(traces.T)  # corrcoef expects (N, T)


def compute_pairwise_correlation(traces: np.ndarray) -> np.ndarray:
    """Alias for compute_functional_connectivity."""
    return compute_functional_connectivity(traces)


def compute_power_spectrum(
    trace: np.ndarray,
    dt: float,
    max_freq_hz: Optional[float] = None,
) -> Tuple[np.ndarray, np.ndarray]:
    """Compute the power spectrum of a 1D time series.
    
    Args:
        trace: 1D array of length T
        dt: simulation time step in seconds
        max_freq_hz: optional frequency cap for the returned spectrum
    Returns:
        (freqs_hz, power) — both 1D arrays of the same length.
    """
    n = len(trace)
    fft = np.fft.rfft(trace - trace.mean())
    power = (np.abs(fft) ** 2) / n
    freqs = np.fft.rfftfreq(n, d=dt)

    if max_freq_hz is not None:
        cutoff = freqs <= max_freq_hz
        freqs = freqs[cutoff]
        power = power[cutoff]

    return freqs, power


def compute_dominant_frequency(trace: np.ndarray, dt: float) -> float:
    """Return the frequency (Hz) of the dominant spectral peak.
    
    Returns 0.0 if the trace has no variance.
    """
    freqs, power = compute_power_spectrum(trace, dt)
    if len(freqs) == 0 or power.max() == 0:
        return 0.0
    # Skip the DC component (freq == 0)
    nondc = freqs > 0
    if not np.any(nondc):
        return 0.0
    return float(freqs[nondc][np.argmax(power[nondc])])


def compute_kuramoto_order(phases: np.ndarray) -> float:
    """Compute the Kuramoto order parameter R from a vector of phases.
    
    Args:
        phases: 1D array of instantaneous phases in radians, shape (N,).
    Returns:
        R ∈ [0, 1], where 1 = perfect synchrony and 0 = complete desynchrony.
    """
    if len(phases) == 0:
        return 0.0
    complex_mean = np.mean(np.exp(1j * phases))
    return float(np.abs(complex_mean))


def detect_instability(traces: np.ndarray, threshold: float = 0.98) -> dict:
    """Analyse traces for signs of instability.
    
    Args:
        traces: shape (T, N)
        threshold: activity value considered saturated
    Returns:
        dict with keys: saturated_regions, collapsed_regions, max_activity,
                        min_std, is_stable.
    """
    if traces.shape[0] == 0:
        return {"is_stable": True, "saturated_regions": [], "collapsed_regions": [],
                "max_activity": 0.0, "min_std": 0.0}

    means = np.mean(traces, axis=0)
    stds = np.std(traces, axis=0)
    max_act = float(np.max(np.abs(traces)))
    min_std = float(np.min(stds))

    saturated = list(np.where(means >= threshold)[0].tolist())
    collapsed = list(np.where(stds < 1e-10)[0].tolist())

    return {
        "is_stable": len(saturated) == 0 and len(collapsed) < traces.shape[1] // 2,
        "saturated_regions": saturated,
        "collapsed_regions": collapsed,
        "max_activity": max_act,
        "min_std": min_std,
    }
