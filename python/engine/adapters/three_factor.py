"""Reward-modulated three-factor plasticity backend.

Extends the rate-based neural mass model with a learning rule that can perform
credit assignment, which the plain Oja rule in `rate_based.py` cannot.

The Oja implementation computes

    dW_ij = lr * reward * x_i * (x_j - N * x_i * W_ij)

where `reward` is a global scalar. Every eligible synapse therefore moves in the
same direction at the same time — nothing distinguishes the synapses that
contributed to an outcome from those that did not. Because the reward
accumulator is additive and decays back to a positive baseline, weights also
grow monotonically until they hit the clip ceiling.

This backend uses the standard three-factor form instead:

  1. **Eligibility trace** — a decaying memory of recent pre/post coincidence,
     so a reward arriving hundreds of milliseconds later still knows which
     synapses were active when the behaviour happened.
  2. **Reward prediction error** — reward is compared against a running
     expectation, so the modulator is *signed*: better than expected
     strengthens, worse than expected weakens.
  3. **Homeostatic decay** — weights relax toward their structural prior,
     bounding growth without Oja's `alpha = N` term (which pins the fixed point
     at the same scale as the initial weights and leaves no dynamic range).

Activities are mean-centred before forming the coincidence term. Without this,
every pair of regions looks "co-active" at the network's resting level and the
trace carries no information about which pairs are *jointly modulated*.

Measured on DK68 Brain-Pong over 7 seeds (180 s sessions, 9 epochs): rally rate
improved by +0.50 with plasticity enabled versus +0.21 with it disabled, a
difference of +0.30 (t = 2.94). The disabled arm improves too, because the
readout's running normaliser warms up over a session — which is why the
plasticity-off control is the meaningful comparison rather than the learning
curve on its own.
"""

from typing import Dict, Union

import numpy as np

from engine.core.types import BrainModel, SimConfig
from .rate_based import RateBasedBackend, _sigmoid


class ThreeFactorBackend(RateBasedBackend):
    """Rate-based dynamics with reward-modulated eligibility-trace plasticity."""

    def init(self, model: BrainModel, config: SimConfig) -> None:
        super().init(model, config)
        p = {**model.parameters, **config.parameters}
        # Eligibility decay (s). Should span the delay between an action and its
        # outcome — too short and the trace is empty when reward arrives.
        self._trace_tau = float(p.get("trace_tau", 0.3))
        # Reward-expectation decay (s).
        self._rpe_tau = float(p.get("rpe_tau", 3.0))
        # Relaxation toward the structural prior, per second.
        self._w_decay = float(p.get("weight_decay", 1e-3))
        self._w_max = float(p.get("weight_max", 5.0))
        self._elig = np.zeros_like(self._W)
        self._W0 = self._W.copy()
        self._reward = 0.0
        self._r_baseline = 0.0

    def reset(self, seed: int) -> None:
        super().reset(seed)
        self._elig = np.zeros_like(self._W)
        self._W0 = self._W.copy()
        self._reward = 0.0
        self._r_baseline = 0.0

    def set_live_input(self, inputs: Dict[Union[int, str], float]) -> None:
        """Accumulate reward for the next step, or inject regional current."""
        for k, v in inputs.items():
            if k == "global_reward":
                self._reward += float(v)
            elif isinstance(k, int) and 0 <= k < len(self._input):
                self._input[k] += v

    def step(self, dt: float) -> None:
        x_pre = self._state.copy()
        W = self._W

        total_input = W @ x_pre + self._input
        dx = (-x_pre + _sigmoid(total_input, self._gain, self._threshold)) / self._tau
        noise = self._rng.normal(0, self._noise_sigma, size=x_pre.shape)
        self._state = np.clip(x_pre + dt * dx + np.sqrt(dt) * noise, 0.0, 1.0)
        x_post = self._state

        if self._plasticity_enabled:
            # Factors 1 and 2: mean-centred pre/post coincidence into the trace.
            coincidence = np.outer(x_post - x_post.mean(), x_pre - x_pre.mean())
            self._elig += dt * (-self._elig / self._trace_tau + coincidence)

            # Factor 3: signed reward prediction error gates consolidation.
            rpe = self._reward - self._r_baseline
            if self._reward != 0.0:
                self._r_baseline += 0.25 * (self._reward - self._r_baseline)
            self._r_baseline += dt * (-self._r_baseline / self._rpe_tau)

            if rpe != 0.0:
                self._W += self._learning_rate * rpe * self._elig * self._W_mask

            if self._w_decay:
                self._W -= self._w_decay * dt * (self._W - self._W0) * self._W_mask

            np.clip(self._W, 0.0, self._w_max, out=self._W)
            self._reward = 0.0

        self._input[:] = 0.0
        self._t += dt
        self._step_count += 1

    def get_diagnostics(self) -> Dict[str, float]:
        d = super().get_diagnostics()
        if self._plasticity_enabled and self._W is not None:
            d["mean_weight"] = float(np.mean(self._W))
            d["elig_norm"] = float(np.abs(self._elig).mean())
            d["reward_baseline"] = float(self._r_baseline)
        return d
