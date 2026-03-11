from typing import Union
"""Rate-based neural mass backend.

Implements Wilson-Cowan-style rate dynamics for N brain regions:

  dx_i/dt = (-x_i + S(gain * (sum_j W_ij * x_j + I_ext_i))) / tau + noise

where:
  x_i     = activity of region i (bounded [0, 1])
  W_ij    = connectivity weight from j to i
  S(.)    = sigmoid transfer function
  tau     = time constant
  gain    = gain parameter for the sigmoid
  I_ext_i = external input / stimulus
  noise   = Gaussian noise with std noise_sigma

This is a standard model in computational neuroscience for studying
large-scale cortical dynamics. It captures excitation-inhibition balance
and emergent oscillations without requiring single-neuron resolution.
"""

import pickle
from typing import Dict
import numpy as np

from engine.core.backend import SimulationBackend
from engine.core.types import BrainModel, SimConfig, Stimulus


def _sigmoid(x: np.ndarray, gain: float = 1.0, threshold: float = 0.5) -> np.ndarray:
    """Standard sigmoid transfer function."""
    return 1.0 / (1.0 + np.exp(-gain * (x - threshold)))


class RateBasedBackend(SimulationBackend):
    """Wilson-Cowan-style rate-based network model."""

    def __init__(self):
        self._model: BrainModel | None = None
        self._config: SimConfig | None = None
        self._rng: np.random.Generator | None = None
        self._state: np.ndarray | None = None  # (N,) activity
        self._input: np.ndarray | None = None  # (N,) external input
        self._W: np.ndarray | None = None  # (N, N) connectivity
        self._t: float = 0.0
        self._step_count: int = 0

        # Parameters with defaults
        self._tau: float = 0.01
        self._gain: float = 1.0
        self._noise_sigma: float = 0.02
        self._global_coupling: float = 0.5
        self._threshold: float = 0.5

    def init(self, model: BrainModel, config: SimConfig) -> None:
        self._model = model
        self._config = config
        n = model.n_regions

        # Extract parameters
        p = {**model.parameters, **config.parameters}
        self._tau = p.get("tau", 0.01)
        self._gain = p.get("gain", 1.0)
        self._noise_sigma = p.get("noise_sigma", 0.02)
        self._global_coupling = p.get("global_coupling", 0.5)
        self._threshold = p.get("threshold", 0.0)

        # Plasticity parameters
        # Boolean from JSON might be true/false strings or actual bools
        p_enabled = p.get("plasticity_enabled", False)
        self._plasticity_enabled = p_enabled is True or str(p_enabled).lower() == "true"
        self._learning_rate = float(p.get("learning_rate", 0.05))
        self._reward = 0.01 # Baseline plasticity level

        # Prepare weighted connectivity matrix.
        n = model.n_regions
        W_raw = model.connectivity_matrix.copy()
        
        # Mean-field normalization
        W_normalized = W_raw / max(n, 1)
        self._W = W_normalized * self._global_coupling

        # Boolean mask to only allow plasticity to modify existing Structural connections
        # (Where W_raw > 0)
        self._W_mask = (W_raw > 0).astype(np.float64)

        self._state = np.zeros(n, dtype=np.float64)
        self._input = np.zeros(n, dtype=np.float64)

    def reset(self, seed: int) -> None:
        self._rng = np.random.default_rng(seed)
        n = self._model.n_regions
        
        # Add deterministic small structural noise based on seed for unique run fingerprints
        if self._W is not None:
             structural_noise = self._rng.normal(0, 0.05, size=self._W.shape) * self._W_mask
             self._W = np.clip(self._W + structural_noise, 0.0, 5.0)

        # Initialize with small random activity
        self._state = self._rng.uniform(0.0, 0.1, size=n)
        self._input = np.zeros(n, dtype=np.float64)
        self._t = 0.0
        self._step_count = 0

    def step(self, dt: float) -> None:
        x = self._state
        W = self._W

        # Network input: weighted sum of connected region activities
        network_input = W @ x

        # Total input including external stimulation
        total_input = network_input + self._input

        # Rate dynamics with sigmoid nonlinearity
        dx = (-x + _sigmoid(total_input, self._gain, self._threshold)) / self._tau

        # Add noise
        noise = self._rng.normal(0, self._noise_sigma, size=x.shape)

        # Euler integration for activity
        self._state = np.clip(x + dt * dx + np.sqrt(dt) * noise, 0.0, 1.0)

        # Apply Hebbian Plasticity (Oja's Rule) if enabled
        if self._plasticity_enabled:
            # Oja's rule: dW_ij = eta * x_i * (x_j - x_i * W_ij)
            # x_i is post-synaptic (row i), x_j is pre-synaptic (col j)
            # Using broadcasting:
            # x[:, None] is (N, 1) -> post
            # x[None, :] is (1, N) -> pre
            # We scale the decay term by alpha = N to limit macroscopic weight growth
            alpha = len(self._state)
            
            # Apply Dopaminergic reward tuning to plasticity rate
            dW = (self._learning_rate * self._reward) * self._state[:, None] * (self._state[None, :] - alpha * self._state[:, None] * W)
            
            # Decay dopamine reward back to baseline (0.01)
            self._reward += (0.01 - self._reward) * (dt / 1.0) # 1 second decay constant
            
            # Apply mask to only modify existing connections, scale by dt
            self._W += dW * self._W_mask * dt
            
            # Clip weights to prevent endless explosion (bound between 0 and 5.0)
            self._W = np.clip(self._W, 0.0, 5.0)

        # Reset external input (must be re-applied each step if persistent)
        self._input[:] = 0.0

        self._t += dt
        self._step_count += 1

    def observe(self) -> Dict[str, np.ndarray]:
        return {
            "activity": self._state.copy(),
            "time": np.array([self._t]),
        }

    def apply_stimulus(self, stimulus: Stimulus) -> None:
        value = stimulus.get_value(self._t, self._rng)
        for idx in stimulus.target_indices:
            if 0 <= idx < len(self._input):
                self._input[idx] += value

    def save_checkpoint(self) -> bytes:
        return pickle.dumps({
            "state": self._state,
            "input": self._input,
            "t": self._t,
            "step_count": self._step_count,
            "rng_state": self._rng.bit_generator.state,
        })

    def load_checkpoint(self, data: bytes) -> None:
        ckpt = pickle.loads(data)
        self._state = ckpt["state"]
        self._input = ckpt["input"]
        self._t = ckpt["t"]
        self._step_count = ckpt["step_count"]
        self._rng.bit_generator.state = ckpt["rng_state"]

    def shutdown(self) -> None:
        self._state = None
        self._input = None
        self._W = None

    def get_diagnostics(self) -> Dict[str, float]:
        d = {
            "mean_activity": float(np.mean(self._state)),
            "std_activity": float(np.std(self._state)),
            "max_activity": float(np.max(self._state)),
            "min_activity": float(np.min(self._state)),
            "sim_time": self._t,
        }
        
        if self._plasticity_enabled and self._W is not None:
            d["mean_weight"] = float(np.mean(self._W))
            
        return d

    def set_live_input(self, inputs: Dict[Union[int, str], float]) -> None:
        """
        Apply instantaneous external input to specific regions 
        or update global neuromodulatory state (e.g. dopamine reward).
        """
        for k, v in inputs.items():
            if k == "global_reward":
                # Addive dopamine bursts (allow negative for punishment)
                self._reward += float(v)
            elif isinstance(k, int) and 0 <= k < len(self._input):
                self._input[k] += v
