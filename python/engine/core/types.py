"""Core data types for the simulation engine.

These are the internal representations used by simulation backends.
They are constructed from API payloads by the job runner.
"""

from dataclasses import dataclass, field
from typing import Optional
import numpy as np


@dataclass
class Region:
    id: str
    name: str
    index: int
    hemisphere: Optional[str] = None
    coordinates: Optional[tuple[float, float, float]] = None
    metadata: dict = field(default_factory=dict)


@dataclass
class Connection:
    source_index: int
    target_index: int
    weight: float
    delay: float = 0.0
    connection_type: str = "excitatory"


@dataclass
class BrainModel:
    """Represents a brain model ready for simulation.

    The connectivity_matrix is a dense NxN numpy array where N is the number
    of regions. Entry [i,j] is the weight of the connection from region i to
    region j. Zero means no connection.

    The delay_matrix follows the same convention for conduction delays.
    """

    id: str
    name: str
    regions: list[Region]
    connectivity_matrix: np.ndarray  # shape (N, N)
    delay_matrix: np.ndarray  # shape (N, N)
    parameters: dict = field(default_factory=dict)

    @property
    def n_regions(self) -> int:
        return len(self.regions)

    def validate(self) -> list[str]:
        """Return a list of validation errors (empty if valid)."""
        errors = []
        n = self.n_regions
        if self.connectivity_matrix.shape != (n, n):
            errors.append(
                f"Connectivity matrix shape {self.connectivity_matrix.shape} "
                f"does not match region count {n}"
            )
        if self.delay_matrix.shape != (n, n):
            errors.append(
                f"Delay matrix shape {self.delay_matrix.shape} "
                f"does not match region count {n}"
            )
        if np.any(np.isnan(self.connectivity_matrix)):
            errors.append("Connectivity matrix contains NaN values")
        if np.any(np.isnan(self.delay_matrix)):
            errors.append("Delay matrix contains NaN values")
        if np.any(self.delay_matrix < 0):
            errors.append("Delay matrix contains negative values")
        return errors


@dataclass
class Stimulus:
    """External stimulus to inject into the simulation."""

    target_indices: list[int]
    stimulus_type: str  # constant, pulse, ramp, noise, sine
    amplitude: float
    start_time: float
    end_time: float
    parameters: dict = field(default_factory=dict)

    def get_value(self, t: float, rng: np.random.Generator) -> float:
        """Compute stimulus value at time t."""
        if t < self.start_time or t > self.end_time:
            return 0.0

        if self.stimulus_type == "constant":
            return self.amplitude

        if self.stimulus_type == "pulse":
            return self.amplitude

        if self.stimulus_type == "ramp":
            frac = (t - self.start_time) / (self.end_time - self.start_time)
            return self.amplitude * frac

        if self.stimulus_type == "noise":
            sigma = self.parameters.get("sigma", 1.0)
            return self.amplitude * rng.normal(0, sigma)

        if self.stimulus_type == "sine":
            freq = self.parameters.get("frequency", 10.0)
            return self.amplitude * np.sin(2 * np.pi * freq * t)

        return 0.0


@dataclass
class SimConfig:
    """Configuration for a simulation run."""

    backend: str  # rate_based, spiking, whole_brain
    duration: float  # seconds of simulation time
    dt: float = 0.001  # timestep in seconds
    seed: int = 42
    report_interval: int = 10  # emit metrics every N steps
    checkpoint_interval: Optional[int] = None
    parameters: dict = field(default_factory=dict)
    stimuli: list[Stimulus] = field(default_factory=list)

    @property
    def total_steps(self) -> int:
        return int(np.ceil(self.duration / self.dt))
