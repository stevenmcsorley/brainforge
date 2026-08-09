"""Linear readouts over network activity, fitted supervised.

Closed-loop environments need to turn population activity into a control signal.
Reading a single region's activity through an adaptive normaliser scores no
better than an actuator that never moves; a linear readout over the whole
population, fitted against a known target, plays the task.

The measured gap between fitting this readout and learning it from reward is the
central result of the closed-loop work:

======================================  ==========================
method (identical activity + weights)   held-out rally rate
======================================  ==========================
stationary actuator                     0.212
three-factor plasticity (reward)        ~0.10
node perturbation (reward)              ~0.13
population readout + REINFORCE          ~0.17
**supervised least squares**            **0.68-0.75**
======================================  ==========================

The network represents the task — position, velocity and landing point decode at
r = 0.97, 0.97 and 0.93. What a scalar reward cannot do is *find* the readout
that extracts them. Fit it instead.

Reward fine-tuning on top of a fitted readout was measured and adds nothing:
0.680 -> 0.696 over five held-out seeds, t = 0.26, with interception error
unchanged to three decimals while weights moved by |dw| ~ 2.5-3.2. Two seeds
improved, two degraded, one was flat. Do not layer reward on top of this
readout; it perturbs the solution without improving it.

Usage:

    fit = fit_readout(activity, targets)          # collect during teacher forcing
    paddle = fit.predict(current_activity)
"""
from dataclasses import dataclass
from typing import Optional

import numpy as np


@dataclass
class LinearReadout:
    """A fitted linear map from region activity to a scalar control signal."""

    weights: np.ndarray          # shape (n_regions + 1,), last element is the bias
    train_r: float
    train_abs_error: float

    def predict(self, activity: np.ndarray) -> float:
        """Control value for one activity vector."""
        return float(np.dot(self.weights, np.append(np.asarray(activity), 1.0)))

    def predict_many(self, activity: np.ndarray) -> np.ndarray:
        """Control values for an (n_samples, n_regions) array."""
        a = np.asarray(activity)
        return np.hstack([a, np.ones((len(a), 1))]) @ self.weights

    @property
    def n_regions(self) -> int:
        return len(self.weights) - 1


def fit_readout(activity: np.ndarray, targets: np.ndarray,
                ridge: float = 1e-3) -> LinearReadout:
    """Least-squares fit of activity → target, with ridge regularisation.

    `activity` is (n_samples, n_regions); `targets` is (n_samples,) in whatever
    units the actuator uses. Pool samples from several seeds — a readout fitted
    on one rollout overfits that ball sequence and generalises worse.
    """
    a = np.asarray(activity, dtype=float)
    y = np.asarray(targets, dtype=float)
    if a.ndim != 2:
        raise ValueError(f"activity must be 2D (n_samples, n_regions), got {a.shape}")
    if len(a) != len(y):
        raise ValueError(f"activity has {len(a)} samples but targets has {len(y)}")
    if len(a) <= a.shape[1]:
        raise ValueError(
            f"need more samples than regions to fit ({len(a)} <= {a.shape[1]}); "
            "collect a longer rollout")

    x = np.hstack([a, np.ones((len(a), 1))])
    gram = x.T @ x + ridge * np.eye(x.shape[1])
    w = np.linalg.solve(gram, x.T @ y)
    pred = x @ w
    r = float(np.corrcoef(pred, y)[0, 1]) if y.std() > 0 else 0.0
    return LinearReadout(weights=w, train_r=r,
                         train_abs_error=float(np.abs(pred - y).mean()))


def evaluate_readout(readout: LinearReadout, activity: np.ndarray,
                     targets: np.ndarray, tolerance: Optional[float] = None) -> dict:
    """Held-out accuracy. `tolerance` is the actuator's half-width, if it has one."""
    pred = readout.predict_many(activity)
    y = np.asarray(targets, dtype=float)
    err = np.abs(pred - y)
    out = dict(r=float(np.corrcoef(pred, y)[0, 1]) if y.std() > 0 else 0.0,
               mean_abs_error=float(err.mean()),
               median_abs_error=float(np.median(err)))
    if tolerance is not None:
        out["within_tolerance"] = float((err < tolerance).mean())
    return out
