"""Tests for the supervised linear readout."""
import numpy as np
import pytest

from engine.analysis.readout import LinearReadout, evaluate_readout, fit_readout


def _synthetic(n_samples=500, n_regions=20, seed=0, noise=0.05):
    """Activity where the target is a known linear function of a few regions."""
    rng = np.random.default_rng(seed)
    a = rng.random((n_samples, n_regions))
    true_w = np.zeros(n_regions)
    idx = [i for i in (2, 5, 11) if i < n_regions]
    true_w[idx] = [3.0, -2.0, 1.5][:len(idx)]
    y = a @ true_w + 10.0 + rng.normal(0, noise, n_samples)
    return a, y


def test_recovers_a_linear_mapping():
    a, y = _synthetic()
    fit = fit_readout(a, y)
    assert fit.train_r > 0.98
    assert fit.n_regions == 20


def test_generalises_to_held_out_samples():
    a, y = _synthetic(seed=1)
    split = 350
    fit = fit_readout(a[:split], y[:split])
    got = evaluate_readout(fit, a[split:], y[split:], tolerance=0.5)
    assert got["r"] > 0.95
    assert got["within_tolerance"] > 0.9


def test_predict_matches_predict_many():
    a, y = _synthetic(seed=2)
    fit = fit_readout(a, y)
    assert fit.predict(a[0]) == pytest.approx(fit.predict_many(a[:1])[0])


def test_rejects_underdetermined_fit():
    """Fewer samples than regions cannot identify a readout."""
    rng = np.random.default_rng(0)
    with pytest.raises(ValueError, match="more samples than regions"):
        fit_readout(rng.random((10, 20)), rng.random(10))


def test_rejects_mismatched_lengths():
    rng = np.random.default_rng(0)
    with pytest.raises(ValueError, match="samples but targets"):
        fit_readout(rng.random((100, 5)), rng.random(90))


def test_ridge_bounds_weights_on_collinear_input():
    """Duplicated regions make the fit ill-conditioned; ridge must keep it finite."""
    a, y = _synthetic(n_regions=10, seed=3)
    a = np.hstack([a, a])           # perfectly collinear copies
    fit = fit_readout(a, y, ridge=1e-2)
    assert np.isfinite(fit.weights).all()
    assert fit.train_r > 0.9
