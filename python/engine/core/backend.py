"""Abstract simulation backend interface.

All simulation backends must implement this interface. The runner
calls these methods in a standardized lifecycle:
  init → reset → (step → observe → apply_stimulus)* → shutdown
"""

from abc import ABC, abstractmethod
from typing import Dict
import numpy as np

from .types import BrainModel, SimConfig, Stimulus


class SimulationBackend(ABC):
    """Base class for all simulation backends."""

    @abstractmethod
    def init(self, model: BrainModel, config: SimConfig) -> None:
        """Initialize the backend with model and configuration.

        Called once before the simulation loop begins.
        Must allocate all state arrays and prepare for stepping.
        """
        ...

    @abstractmethod
    def reset(self, seed: int) -> None:
        """Reset state to initial conditions with given random seed.

        Must produce identical initial state for the same seed.
        """
        ...

    @abstractmethod
    def step(self, dt: float) -> None:
        """Advance the simulation by one timestep of duration dt (seconds)."""
        ...

    @abstractmethod
    def observe(self) -> Dict[str, np.ndarray]:
        """Return current observable state.

        Must include at minimum:
          "activity": np.ndarray of shape (N,) — per-region activation
        May also include:
          "firing_rate", "membrane_potential", "phase", etc.
        """
        ...

    @abstractmethod
    def apply_stimulus(self, stimulus: Stimulus) -> None:
        """Apply an external stimulus to the simulation state.

        The stimulus object contains target indices and amplitude.
        The backend decides how to integrate this into its dynamics.
        """
        ...

    @abstractmethod
    def save_checkpoint(self) -> bytes:
        """Serialize the full simulation state to bytes.

        Must capture everything needed to resume from this exact point.
        """
        ...

    @abstractmethod
    def load_checkpoint(self, data: bytes) -> None:
        """Restore simulation state from checkpoint bytes."""
        ...

    @abstractmethod
    def shutdown(self) -> None:
        """Release resources. Called once after simulation completes."""
        ...

    def get_diagnostics(self) -> Dict[str, float]:
        """Return backend-specific diagnostic metrics.

        Optional. Used by the runner for observability.
        """
        return {}
