"""Stimulus type definitions for the BRAINFORGE simulation engine.

All stimulus types are immutable dataclasses. The backends consume
them via the apply_stimulus() interface.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional


class StimulusType(str, Enum):
    CONSTANT = "constant"
    PULSE = "pulse"
    RAMP = "ramp"
    NOISE = "noise"
    SINE = "sine"
    LESION = "lesion"
    PHARMACOLOGICAL = "pharmacological"


@dataclass
class ConstantStimulus:
    """Apply a constant external input to a set of target regions.
    
    Adds `amplitude` to the external current for every simulation step
    while `start_time <= sim_time <= end_time`.
    """
    targets: List[int]      # region indices
    amplitude: float        # normalised [0, 1] for rate-based; nA for spiking
    start_time: float = 0.0
    end_time: float = float("inf")
    type: StimulusType = field(default=StimulusType.CONSTANT, init=False)


@dataclass
class PulseStimulus:
    """Apply a periodic pulse train to target regions.
    
    Within the active window [start_time, end_time], pulses are emitted
    at intervals of `period` seconds, each lasting `duration` seconds.
    """
    targets: List[int]
    amplitude: float
    start_time: float
    duration: float     # pulse on-time in seconds
    period: float       # pulse repetition period in seconds
    end_time: float = float("inf")
    type: StimulusType = field(default=StimulusType.PULSE, init=False)

    def is_active(self, sim_time: float) -> bool:
        if not (self.start_time <= sim_time <= self.end_time):
            return False
        phase = (sim_time - self.start_time) % self.period
        return phase < self.duration


@dataclass
class RampStimulus:
    """Linearly ramp external input from `amplitude_start` to `amplitude_end`."""
    targets: List[int]
    amplitude_start: float
    amplitude_end: float
    start_time: float
    end_time: float
    type: StimulusType = field(default=StimulusType.RAMP, init=False)

    def amplitude_at(self, sim_time: float) -> float:
        if sim_time <= self.start_time:
            return self.amplitude_start
        if sim_time >= self.end_time:
            return self.amplitude_end
        t = (sim_time - self.start_time) / (self.end_time - self.start_time)
        return self.amplitude_start + t * (self.amplitude_end - self.amplitude_start)


@dataclass
class NoiseStimulus:
    """Additive Gaussian noise injected into target regions.
    
    At each step, samples noise ~ N(mean, std) and adds to external input.
    Useful for testing stochastic stability and noise-driven resonance.
    """
    targets: List[int]
    std: float
    mean: float = 0.0
    start_time: float = 0.0
    end_time: float = float("inf")
    seed: Optional[int] = None
    type: StimulusType = field(default=StimulusType.NOISE, init=False)


@dataclass
class SineStimulus:
    """Sinusoidal oscillatory drive at a specified frequency."""
    targets: List[int]
    amplitude: float
    frequency_hz: float     # oscillation frequency
    phase_rad: float = 0.0  # initial phase in radians
    offset: float = 0.0     # DC offset
    start_time: float = 0.0
    end_time: float = float("inf")
    type: StimulusType = field(default=StimulusType.SINE, init=False)

    def amplitude_at(self, sim_time: float) -> float:
        import math
        return self.offset + self.amplitude * math.sin(
            2 * math.pi * self.frequency_hz * sim_time + self.phase_rad
        )


@dataclass
class Lesion:
    """Silence one or more regions by zeroing their inputs and outputs.
    
    This is modelled by setting all incoming and outgoing weights to zero
    at the start of the active window and restoring them afterwards.
    
    Note: not all backends support dynamic weight restoration.
    """
    targets: List[int]
    start_time: float
    end_time: float = float("inf")
    strength: float = 1.0   # 0=no effect, 1=complete silencing
    type: StimulusType = field(default=StimulusType.LESION, init=False)


@dataclass
class PharmacologicalModifier:
    """Generic parameter modifier that simulates pharmacological effects.
    
    Scales a named backend parameter by `factor` during the active window.
    Examples:
        - Reducing `gain` simulates a GABAergic drug (global inhibition)
        - Reducing `tau` simulates a fast-kinetics drug
        - Increasing `coupling` simulates enhanced connectivity
    """
    parameter: str          # backend parameter name to modify
    factor: float           # multiplicative factor
    targets: Optional[List[int]] = None  # None = global
    start_time: float = 0.0
    end_time: float = float("inf")
    type: StimulusType = field(default=StimulusType.PHARMACOLOGICAL, init=False)
