"""Node-perturbation (REINFORCE) plasticity backend.

Three-factor plasticity gates every eligible synapse with one global scalar, so
it can shift the network's operating point but cannot make synapse A strengthen
while synapse B weakens. Node perturbation fixes exactly that.

Each region i receives its own independent exploratory noise xi_i. The resulting
perturbation is remembered in a per-region trace. When reward arrives, a region
whose perturbation *preceded* better-than-expected reward gets its incoming
weights strengthened in proportion to ITS OWN perturbation:

    dW_ij  =  lr * rpe * pert_trace_i * x_j

pert_trace_i differs per region, so the update is spatially specific — this is
the REINFORCE / weight-perturbation estimator of the reward gradient.

Contrast with three-factor, where the modulator is identical for all i:

    dW_ij  =  lr * rpe * elig_ij       (elig from pre/post coincidence only)

**Measured behaviour, and its limit.** The credit assignment works as intended:
on a single reward this rule pushes 34 of 68 postsynaptic rows up and 34 down,
against 58 up / 10 down for `three_factor`, with 2.4x the row-to-row variation.
On the predictive Pong task it beats three-factor -- +0.064 held-out rally
improvement against a +0.033 plasticity-off control, where three-factor scored
+0.000 against the same control -- but the difference is not significant
(t = 1.41, n = 5) and interception error improves *less* than in the control.

The reason is structural, not a tuning failure. REINFORCE needs the perturbed
unit to measurably move the output. Here the readout averages 3 regions out of
68, and per-hop gain through the connectome is ~0.005 (w/N * coupling) with a
sigmoid slope near 0.25, so a perturbation at a non-readout region changes the
readout by under 1% of its own noise. Measured across pert_sigma from 0.02 to
0.40, the perturbation explains only 0.4-2.7% of readout variance -- raising it
8x does not help. Roughly 96% of perturbations are invisible to the reward, so
the gradient estimate is dominated by noise.

Making this work needs the readout coupled to a much larger fraction of the
network (population readout over many regions, or a trained linear decoder), not
a larger perturbation.
"""
import numpy as np
from typing import Dict, Union

from engine.core.types import BrainModel, SimConfig
from .rate_based import RateBasedBackend, _sigmoid


class NodePerturbBackend(RateBasedBackend):
    """Rate-based dynamics with node-perturbation reward learning."""

    def init(self, model, config):
        super().init(model, config)
        p = {**model.parameters, **config.parameters}
        self._pert_sigma = float(p.get("pert_sigma", 0.05))
        self._pert_tau = float(p.get("pert_tau", 0.3))
        self._rpe_tau = float(p.get("rpe_tau", 3.0))
        self._w_decay = float(p.get("weight_decay", 1e-3))
        self._w_max = float(p.get("weight_max", 5.0))
        self._baseline_tau = float(p.get("baseline_tau", 2.0))
        n = self._model.n_regions
        self._pert = np.zeros(n)          # current exploratory perturbation
        self._pert_trace = np.zeros(n)    # decaying memory of it
        self._x_trace = np.zeros(n)       # decaying presynaptic activity
        self._W0 = self._W.copy()
        self._reward = 0.0
        self._r_baseline = 0.0

    def reset(self, seed):
        super().reset(seed)
        n = self._model.n_regions
        self._pert = np.zeros(n)
        self._pert_trace = np.zeros(n)
        self._x_trace = np.zeros(n)
        self._W0 = self._W.copy()
        self._reward = 0.0
        self._r_baseline = 0.0

    def set_live_input(self, inputs):
        for k, v in inputs.items():
            if k == "global_reward":
                self._reward += float(v)
            elif isinstance(k, int) and 0 <= k < len(self._input):
                self._input[k] += v

    def step(self, dt):
        x_pre = self._state.copy()
        W = self._W

        # Independent exploratory perturbation per region — the search signal.
        if self._plasticity_enabled:
            self._pert = self._rng.normal(0, self._pert_sigma, size=x_pre.shape)
        else:
            self._pert = np.zeros_like(x_pre)

        total_input = W @ x_pre + self._input + self._pert
        dx = (-x_pre + _sigmoid(total_input, self._gain, self._threshold)) / self._tau
        noise = self._rng.normal(0, self._noise_sigma, size=x_pre.shape)
        self._state = np.clip(x_pre + dt * dx + np.sqrt(dt) * noise, 0.0, 1.0)

        if self._plasticity_enabled:
            # Traces: which regions were perturbed, and what drove them.
            self._pert_trace += dt * (-self._pert_trace / self._pert_tau + self._pert)
            self._x_trace += dt * (-self._x_trace / self._pert_tau + x_pre)

            rpe = self._reward - self._r_baseline
            if self._reward != 0.0:
                self._r_baseline += (1.0 - np.exp(-1.0 / max(self._baseline_tau, 1e-6))) * \
                                    (self._reward - self._r_baseline)
            self._r_baseline += dt * (-self._r_baseline / self._rpe_tau)

            if rpe != 0.0:
                # Spatially specific: row i scaled by region i's OWN perturbation.
                self._W += self._learning_rate * rpe * np.outer(
                    self._pert_trace, self._x_trace) * self._W_mask

            if self._w_decay:
                self._W -= self._w_decay * dt * (self._W - self._W0) * self._W_mask

            np.clip(self._W, 0.0, self._w_max, out=self._W)
            self._reward = 0.0

        self._input[:] = 0.0
        self._t += dt
        self._step_count += 1

    def get_diagnostics(self):
        d = super().get_diagnostics()
        if self._plasticity_enabled and self._W is not None:
            d["mean_weight"] = float(np.mean(self._W))
            d["pert_norm"] = float(np.abs(self._pert_trace).mean())
            d["reward_baseline"] = float(self._r_baseline)
        return d
