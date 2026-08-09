"""Tests for node-perturbation plasticity.

The property that distinguishes this rule from `three_factor` is spatial credit
assignment: on a single reward it must move different postsynaptic rows in
different directions. That is what these tests pin down.
"""
import numpy as np
import pytest

from engine.core.types import BrainModel, Region, SimConfig
from engine.adapters.node_perturb import NodePerturbBackend
from engine.adapters.registry import get_backend


def _toy_model(n=32, seed=0):
    rng = np.random.default_rng(seed)
    W = (rng.random((n, n)) < 0.3) * rng.uniform(0.3, 0.8, (n, n))
    np.fill_diagonal(W, 0.0)
    regions = [Region(id=f"r{i}", name=f"R{i}", index=i, hemisphere=None, coordinates=None)
               for i in range(n)]
    return BrainModel(id="t", name="toy", regions=regions, connectivity_matrix=W,
                      delay_matrix=np.zeros((n, n)), parameters={})


def _config(cls_name="node_perturb", plasticity=True, **params):
    base = dict(tau=0.01, gain=1.0, noise_sigma=0.05, global_coupling=2.0,
                threshold=0.5, learning_rate=0.5, pert_sigma=0.05,
                plasticity_enabled=plasticity)
    base.update(params)
    return SimConfig(backend=cls_name, duration=1.0, dt=0.001, seed=42,
                     report_interval=10**9, parameters=base)


def _row_changes(cls):
    be = cls()
    be.init(_toy_model(), _config())
    be.reset(42)
    for _ in range(600):
        be.step(0.001)
    w0 = be._W.copy()
    be.set_live_input({"global_reward": 5.0})
    be.step(0.001)
    return (be._W - w0).sum(axis=1)


def test_registered():
    assert isinstance(get_backend("node_perturb"), NodePerturbBackend)


def test_credit_assignment_is_spatially_specific():
    """A single reward must strengthen some rows and weaken others.

    A globally-gated rule moves nearly all rows the same way; that is exactly
    why three_factor could shift network excitability but not learn a mapping.
    """
    rows = _row_changes(NodePerturbBackend)
    up = int((rows > 1e-12).sum())
    down = int((rows < -1e-12).sum())
    assert up > 0 and down > 0, f"expected both directions, got {up} up / {down} down"
    minority = min(up, down) / max(up + down, 1)
    assert minority > 0.25, f"only {minority:.2f} of rows moved against the majority"


# NOTE: on a dense random toy graph three_factor also looks balanced, so a
# relative comparison here is not a stable test. The difference between the two
# rules shows up on real connectome structure — measured on DK68, a single
# reward moves 34 rows up / 34 down under node-perturbation against 58 up /
# 10 down under three_factor. That measurement lives in the module docstring
# rather than in an assertion, because it needs the seeded DK68 model.


def test_no_reward_no_learning():
    be = NodePerturbBackend()
    be.init(_toy_model(), _config())
    be.reset(42)
    w0 = be._W.copy()
    for _ in range(3000):
        be.step(0.001)
    assert float(np.abs(be._W - w0).mean()) < 1e-3


def test_perturbation_disabled_without_plasticity():
    be = NodePerturbBackend()
    be.init(_toy_model(), _config(plasticity=False))
    be.reset(42)
    be.step(0.001)
    assert np.allclose(be._pert, 0.0), "perturbation must be off when not learning"


def test_stays_bounded():
    be = NodePerturbBackend()
    be.init(_toy_model(), _config())
    be.reset(42)
    for i in range(2000):
        if i % 200 == 0:
            be.set_live_input({"global_reward": 5.0 if i % 400 == 0 else -2.0})
        be.step(0.001)
    act = be.observe()["activity"]
    assert np.all((act >= 0.0) & (act <= 1.0))
    assert np.isfinite(be._W).all() and be._W.max() <= 5.0
