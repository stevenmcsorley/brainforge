"""Stimulus schedule — manages a collection of stimuli and applies them per time step."""

import numpy as np
from typing import List, Union
from .types import (
    ConstantStimulus, PulseStimulus, RampStimulus,
    NoiseStimulus, SineStimulus, Lesion, PharmacologicalModifier,
    StimulusType,
)

AnyStimulus = Union[
    ConstantStimulus, PulseStimulus, RampStimulus,
    NoiseStimulus, SineStimulus, Lesion, PharmacologicalModifier,
]


class StimulusSchedule:
    """Container for all stimuli active in an experiment.
    
    Backends call `get_external_input(sim_time, n_regions)` to get the
    external current vector, and `get_lesion_mask(sim_time, n_regions)`
    to determine which regions are silenced.
    """

    def __init__(self, stimuli: List[AnyStimulus] = None):
        self._stimuli = stimuli or []
        # Cache noise RNGs per NoiseStimulus (keyed by id)
        self._noise_rngs: dict = {}

    def add(self, stimulus: AnyStimulus) -> None:
        self._stimuli.append(stimulus)

    def get_external_input(self, sim_time: float, n_regions: int) -> np.ndarray:
        """Return an additive external current vector of shape (n_regions,)."""
        ext = np.zeros(n_regions, dtype=np.float64)

        for stim in self._stimuli:
            if stim.type == StimulusType.CONSTANT:
                if stim.start_time <= sim_time <= stim.end_time:
                    for t in stim.targets:
                        if 0 <= t < n_regions:
                            ext[t] += stim.amplitude

            elif stim.type == StimulusType.PULSE:
                if stim.is_active(sim_time):
                    for t in stim.targets:
                        if 0 <= t < n_regions:
                            ext[t] += stim.amplitude

            elif stim.type == StimulusType.RAMP:
                if stim.start_time <= sim_time <= stim.end_time:
                    amp = stim.amplitude_at(sim_time)
                    for t in stim.targets:
                        if 0 <= t < n_regions:
                            ext[t] += amp

            elif stim.type == StimulusType.NOISE:
                if stim.start_time <= sim_time <= stim.end_time:
                    rng = self._noise_rngs.setdefault(
                        id(stim), np.random.default_rng(stim.seed)
                    )
                    for t in stim.targets:
                        if 0 <= t < n_regions:
                            ext[t] += rng.normal(stim.mean, stim.std)

            elif stim.type == StimulusType.SINE:
                if stim.start_time <= sim_time <= stim.end_time:
                    amp = stim.amplitude_at(sim_time)
                    for t in stim.targets:
                        if 0 <= t < n_regions:
                            ext[t] += amp

        return ext

    def get_lesion_mask(self, sim_time: float, n_regions: int) -> np.ndarray:
        """Return a weight multiplier vector (1 = normal, 0 = full lesion)."""
        mask = np.ones(n_regions, dtype=np.float64)
        for stim in self._stimuli:
            if stim.type == StimulusType.LESION:
                if stim.start_time <= sim_time <= stim.end_time:
                    for t in stim.targets:
                        if 0 <= t < n_regions:
                            mask[t] = max(0.0, 1.0 - stim.strength)
        return mask

    def get_parameter_modifiers(self, sim_time: float) -> dict:
        """Return {parameter_name: factor} for active pharmacological modifiers."""
        mods = {}
        for stim in self._stimuli:
            if stim.type == StimulusType.PHARMACOLOGICAL:
                if stim.start_time <= sim_time <= stim.end_time:
                    mods[stim.parameter] = stim.factor
        return mods

    def active_at(self, sim_time: float) -> List[AnyStimulus]:
        """Return list of stimuli active at the given time."""
        result = []
        for stim in self._stimuli:
            start = getattr(stim, "start_time", 0.0)
            end = getattr(stim, "end_time", float("inf"))
            if start <= sim_time <= end:
                result.append(stim)
        return result

    def __len__(self) -> int:
        return len(self._stimuli)
