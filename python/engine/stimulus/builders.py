"""Stimulus builder helpers — concise constructors for common stimulation protocols."""

from typing import List, Optional
from .types import (
    ConstantStimulus, PulseStimulus, NoiseStimulus, SineStimulus, Lesion,
)


def make_constant(
    targets: List[int],
    amplitude: float,
    start: float = 0.0,
    end: float = float("inf"),
) -> ConstantStimulus:
    """Constant tonic drive to target regions."""
    return ConstantStimulus(targets=targets, amplitude=amplitude,
                            start_time=start, end_time=end)


def make_pulse_train(
    targets: List[int],
    amplitude: float,
    start: float,
    end: float,
    frequency_hz: float = 10.0,
    duty_cycle: float = 0.5,
) -> PulseStimulus:
    """Periodic pulse train at `frequency_hz` with given duty cycle."""
    period = 1.0 / frequency_hz
    duration = period * duty_cycle
    return PulseStimulus(
        targets=targets,
        amplitude=amplitude,
        start_time=start,
        duration=duration,
        period=period,
        end_time=end,
    )


def make_noise(
    targets: List[int],
    std: float,
    mean: float = 0.0,
    start: float = 0.0,
    end: float = float("inf"),
    seed: Optional[int] = None,
) -> NoiseStimulus:
    """Gaussian noise injection."""
    return NoiseStimulus(targets=targets, std=std, mean=mean,
                         start_time=start, end_time=end, seed=seed)


def make_sine(
    targets: List[int],
    amplitude: float,
    frequency_hz: float,
    phase_rad: float = 0.0,
    offset: float = 0.0,
    start: float = 0.0,
    end: float = float("inf"),
) -> SineStimulus:
    """Sinusoidal oscillatory drive."""
    return SineStimulus(
        targets=targets,
        amplitude=amplitude,
        frequency_hz=frequency_hz,
        phase_rad=phase_rad,
        offset=offset,
        start_time=start,
        end_time=end,
    )


def make_lesion(
    targets: List[int],
    start: float,
    end: float = float("inf"),
    strength: float = 1.0,
) -> Lesion:
    """Region silencing / lesion."""
    return Lesion(targets=targets, start_time=start, end_time=end, strength=strength)
