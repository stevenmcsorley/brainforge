"""Stimulus and perturbation system for the BRAINFORGE simulation engine.

Provides typed stimulus definitions, time-series schedules, and helpers
to construct common stimulation protocols (constant drive, pulse trains,
noise injection, sine waves, lesions, pharmacological modifiers).

Usage::

    from engine.stimulus import ConstantStimulus, PulseStimulus, StimulusSchedule

    schedule = StimulusSchedule([
        ConstantStimulus(targets=[0, 1, 2], amplitude=0.2, start=0.0, end=0.5),
        PulseStimulus(targets=[5], amplitude=1.0, start=0.5, duration=0.01,
                      period=0.05, end=1.0),
    ])
"""

from .types import (
    StimulusType,
    ConstantStimulus,
    PulseStimulus,
    RampStimulus,
    NoiseStimulus,
    SineStimulus,
    Lesion,
    PharmacologicalModifier,
)
from .schedule import StimulusSchedule
from .builders import (
    make_constant,
    make_pulse_train,
    make_noise,
    make_sine,
    make_lesion,
)

__all__ = [
    "StimulusType",
    "ConstantStimulus",
    "PulseStimulus",
    "RampStimulus",
    "NoiseStimulus",
    "SineStimulus",
    "Lesion",
    "PharmacologicalModifier",
    "StimulusSchedule",
    "make_constant",
    "make_pulse_train",
    "make_noise",
    "make_sine",
    "make_lesion",
]
