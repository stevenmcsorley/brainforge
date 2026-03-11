"""Spiking population backend.

Implements a leaky integrate-and-fire (LIF) population model where
each brain region is represented by a population of N_pop spiking neurons.

The population firing rate is the observable quantity that maps to the
region-level dynamics used elsewhere in the platform.

Model per neuron in population k:
  tau_m * dV_k/dt = -(V_k - V_rest) + R * (I_syn_k + I_ext_k) + noise

When V_k >= V_thresh: spike, reset V_k = V_reset, enter refractory period.

For efficiency, we track population-level statistics rather than
simulating every individual neuron. Each region maintains a population
of `pop_size` neurons, and we compute mean firing rates over time windows.

This is a simplified model — a full spiking simulator (NEST, Brian2)
would replace this adapter for production spiking research.
"""

import pickle
from typing import Dict
import numpy as np

from engine.core.backend import SimulationBackend
from engine.core.types import BrainModel, SimConfig, Stimulus


class SpikingBackend(SimulationBackend):
    """LIF population spiking model."""

    def __init__(self):
        self._model: BrainModel | None = None
        self._config: SimConfig | None = None
        self._rng: np.random.Generator | None = None

        # Population parameters
        self._pop_size: int = 100  # neurons per region
        self._V: np.ndarray | None = None  # (N, pop_size) membrane potentials
        self._refractory: np.ndarray | None = None  # (N, pop_size) refractory counters
        self._spikes: np.ndarray | None = None  # (N, pop_size) spike flags this step
        self._firing_rates: np.ndarray | None = None  # (N,) smoothed firing rates
        self._input: np.ndarray | None = None  # (N,) external input
        self._W: np.ndarray | None = None

        self._t: float = 0.0
        self._step_count: int = 0

        # Neuron parameters
        self._tau_m: float = 0.020  # membrane time constant (20ms)
        self._V_rest: float = -65.0  # mV
        self._V_thresh: float = -50.0  # mV
        self._V_reset: float = -70.0  # mV
        self._R: float = 10.0  # membrane resistance
        self._t_ref: float = 0.002  # refractory period (2ms)
        self._noise_sigma: float = 2.0
        self._rate_tau: float = 0.050  # rate smoothing time constant

    def init(self, model: BrainModel, config: SimConfig) -> None:
        self._model = model
        self._config = config
        n = model.n_regions

        p = {**model.parameters, **config.parameters}
        self._pop_size = int(p.get("pop_size", 100))
        self._tau_m = p.get("tau_m", 0.020)
        self._noise_sigma = p.get("noise_sigma", 2.0)
        coupling = p.get("global_coupling", 0.5)

        W = model.connectivity_matrix.copy() * coupling
        row_sums = np.abs(W).sum(axis=1, keepdims=True)
        row_sums[row_sums == 0] = 1.0
        self._W = W / row_sums

    def reset(self, seed: int) -> None:
        self._rng = np.random.default_rng(seed)
        n = self._model.n_regions
        pop = self._pop_size

        self._V = self._rng.uniform(self._V_rest, self._V_thresh, size=(n, pop))
        self._refractory = np.zeros((n, pop), dtype=np.float64)
        self._spikes = np.zeros((n, pop), dtype=bool)
        self._firing_rates = np.zeros(n, dtype=np.float64)
        self._input = np.zeros(n, dtype=np.float64)
        self._t = 0.0
        self._step_count = 0

    def step(self, dt: float) -> None:
        n = self._model.n_regions
        pop = self._pop_size

        # Network-level input based on firing rates
        network_input = self._W @ self._firing_rates  # (N,)

        # Expand to per-neuron: add the region-level input to each neuron
        I_net = (network_input + self._input)[:, np.newaxis]  # (N, 1)

        # Update refractory counters
        self._refractory = np.maximum(0, self._refractory - dt)
        active = self._refractory <= 0

        # LIF dynamics for non-refractory neurons
        noise = self._rng.normal(0, self._noise_sigma, size=(n, pop))
        dV = (-(self._V - self._V_rest) + self._R * I_net + noise) / self._tau_m

        self._V = np.where(active, self._V + dt * dV, self._V)

        # Detect spikes
        self._spikes = self._V >= self._V_thresh
        self._V = np.where(self._spikes, self._V_reset, self._V)
        self._refractory = np.where(self._spikes, self._t_ref, self._refractory)

        # Update firing rates (exponential moving average)
        instant_rate = self._spikes.sum(axis=1) / (pop * dt)
        alpha = dt / self._rate_tau
        self._firing_rates = (1 - alpha) * self._firing_rates + alpha * instant_rate

        self._input[:] = 0.0
        self._t += dt
        self._step_count += 1

    def observe(self) -> Dict[str, np.ndarray]:
        # Normalize firing rates to [0, 1] range for consistency with other backends
        max_rate = max(np.max(self._firing_rates), 1.0)
        return {
            "activity": np.clip(self._firing_rates / max_rate, 0, 1),
            "firing_rate": self._firing_rates.copy(),
            "mean_potential": self._V.mean(axis=1),
            "time": np.array([self._t]),
        }

    def apply_stimulus(self, stimulus: Stimulus) -> None:
        value = stimulus.get_value(self._t, self._rng)
        for idx in stimulus.target_indices:
            if 0 <= idx < len(self._input):
                self._input[idx] += value

    def save_checkpoint(self) -> bytes:
        return pickle.dumps({
            "V": self._V,
            "refractory": self._refractory,
            "firing_rates": self._firing_rates,
            "t": self._t,
            "step_count": self._step_count,
            "rng_state": self._rng.bit_generator.state,
        })

    def load_checkpoint(self, data: bytes) -> None:
        ckpt = pickle.loads(data)
        self._V = ckpt["V"]
        self._refractory = ckpt["refractory"]
        self._firing_rates = ckpt["firing_rates"]
        self._t = ckpt["t"]
        self._step_count = ckpt["step_count"]
        self._rng.bit_generator.state = ckpt["rng_state"]

    def shutdown(self) -> None:
        self._V = None
        self._refractory = None
        self._spikes = None

    def get_diagnostics(self) -> Dict[str, float]:
        return {
            "mean_firing_rate": float(np.mean(self._firing_rates)),
            "max_firing_rate": float(np.max(self._firing_rates)),
            "mean_potential": float(np.mean(self._V)),
            "sim_time": self._t,
        }
