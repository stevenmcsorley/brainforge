"""Whole-brain Kuramoto oscillator backend.

Implements a Kuramoto-type coupled oscillator model for large-scale
brain dynamics. Each region is modelled as an oscillator with a natural
frequency, and regions interact through the structural connectivity.

Model:
  d(theta_i)/dt = omega_i + K * sum_j W_ij * sin(theta_j - theta_i) + noise

where:
  theta_i = phase of oscillator i
  omega_i = natural frequency of region i (drawn from a distribution)
  K       = global coupling strength
  W_ij    = structural connectivity weight

The Kuramoto model is widely used in computational neuroscience to study
synchronization phenomena, functional connectivity, and metastability
in large-scale brain networks.

Observable: the "activity" is derived from cos(theta) mapped to [0, 1],
which approximates the BOLD-like signal used in fMRI studies.
"""

import pickle
from typing import Dict
import numpy as np

from engine.core.backend import SimulationBackend
from engine.core.types import BrainModel, SimConfig, Stimulus


class WholeBrainBackend(SimulationBackend):
    """Kuramoto coupled oscillator model for whole-brain dynamics."""

    def __init__(self):
        self._model: BrainModel | None = None
        self._config: SimConfig | None = None
        self._rng: np.random.Generator | None = None

        self._theta: np.ndarray | None = None  # (N,) phases
        self._omega: np.ndarray | None = None  # (N,) natural frequencies
        self._input: np.ndarray | None = None
        self._W: np.ndarray | None = None

        self._t: float = 0.0
        self._step_count: int = 0

        # Parameters
        self._K: float = 0.5  # global coupling
        self._noise_sigma: float = 0.01
        self._mean_freq: float = 10.0  # Hz, mean natural frequency
        self._freq_spread: float = 2.0  # Hz, spread of natural frequencies

    def init(self, model: BrainModel, config: SimConfig) -> None:
        self._model = model
        self._config = config

        p = {**model.parameters, **config.parameters}
        self._K = p.get("global_coupling", 0.5)
        self._noise_sigma = p.get("noise_sigma", 0.01)
        self._mean_freq = p.get("mean_freq", 10.0)
        self._freq_spread = p.get("freq_spread", 2.0)

        # Normalize connectivity
        W = model.connectivity_matrix.copy()
        row_sums = np.abs(W).sum(axis=1, keepdims=True)
        row_sums[row_sums == 0] = 1.0
        self._W = W / row_sums

    def reset(self, seed: int) -> None:
        self._rng = np.random.default_rng(seed)
        n = self._model.n_regions

        # Random initial phases
        self._theta = self._rng.uniform(0, 2 * np.pi, size=n)

        # Natural frequencies from normal distribution (in Hz, converted to rad/s)
        self._omega = (
            self._rng.normal(self._mean_freq, self._freq_spread, size=n)
            * 2
            * np.pi
        )

        self._input = np.zeros(n, dtype=np.float64)
        self._t = 0.0
        self._step_count = 0

    def step(self, dt: float) -> None:
        theta = self._theta
        n = len(theta)

        # Phase differences: theta_j - theta_i for all pairs
        # Vectorized: sin(theta[j] - theta[i]) for each i
        phase_diff = np.subtract.outer(theta, theta)  # (N, N)
        coupling = self._W * np.sin(phase_diff)  # (N, N)
        coupling_sum = coupling.sum(axis=1)  # (N,)

        # Kuramoto dynamics
        dtheta = self._omega + self._K * coupling_sum + self._input

        # Noise
        noise = self._rng.normal(0, self._noise_sigma, size=n)

        # Euler integration
        self._theta = (theta + dt * dtheta + np.sqrt(dt) * noise) % (2 * np.pi)

        self._input[:] = 0.0
        self._t += dt
        self._step_count += 1

    def observe(self) -> Dict[str, np.ndarray]:
        # Map phase to activity-like signal: (1 + cos(theta)) / 2 → [0, 1]
        activity = (1.0 + np.cos(self._theta)) / 2.0
        return {
            "activity": activity,
            "phase": self._theta.copy(),
            "time": np.array([self._t]),
        }

    def apply_stimulus(self, stimulus: Stimulus) -> None:
        value = stimulus.get_value(self._t, self._rng)
        for idx in stimulus.target_indices:
            if 0 <= idx < len(self._input):
                # Stimulus acts as an additional frequency drive
                self._input[idx] += value * 2 * np.pi

    def save_checkpoint(self) -> bytes:
        return pickle.dumps({
            "theta": self._theta,
            "omega": self._omega,
            "t": self._t,
            "step_count": self._step_count,
            "rng_state": self._rng.bit_generator.state,
        })

    def load_checkpoint(self, data: bytes) -> None:
        ckpt = pickle.loads(data)
        self._theta = ckpt["theta"]
        self._omega = ckpt["omega"]
        self._t = ckpt["t"]
        self._step_count = ckpt["step_count"]
        self._rng.bit_generator.state = ckpt["rng_state"]

    def shutdown(self) -> None:
        self._theta = None
        self._omega = None

    def get_diagnostics(self) -> Dict[str, float]:
        # Order parameter R: measures global synchronization
        # R = |1/N * sum_j exp(i * theta_j)|
        z = np.exp(1j * self._theta)
        R = float(np.abs(z.mean()))
        return {
            "order_parameter": R,
            "mean_phase": float(np.mean(self._theta)),
            "mean_activity": float((1.0 + np.cos(self._theta).mean()) / 2.0),
            "sim_time": self._t,
        }
