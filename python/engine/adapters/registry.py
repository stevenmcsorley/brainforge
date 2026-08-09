"""Backend registry — maps backend names to classes."""

from engine.core.backend import SimulationBackend
from .rate_based import RateBasedBackend
from .three_factor import ThreeFactorBackend
from .spiking import SpikingBackend
from .whole_brain import WholeBrainBackend

_BACKENDS: dict[str, type[SimulationBackend]] = {
    "rate_based": RateBasedBackend,
    "three_factor": ThreeFactorBackend,
    "spiking": SpikingBackend,
    "whole_brain": WholeBrainBackend,
}


def get_backend(name: str) -> SimulationBackend:
    """Instantiate a backend by name."""
    cls = _BACKENDS.get(name)
    if cls is None:
        available = ", ".join(_BACKENDS.keys())
        raise ValueError(f"Unknown backend '{name}'. Available: {available}")
    return cls()


def register_backend(name: str, cls: type[SimulationBackend]) -> None:
    """Register a custom backend (for plugins)."""
    _BACKENDS[name] = cls
