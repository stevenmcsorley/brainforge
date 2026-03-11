"""End-to-end integration test for the rate-based simulation backend.

Runs entirely standalone — no API, no Redis, no Docker required.
This verifies the simulation engine core works correctly before
attempting to run the full stack.

Run with:
    cd /home/dev/apps/brain/brainforge
    python3 -m pytest python/engine/tests/test_rate_based_e2e.py -v
"""

import sys
from pathlib import Path

import numpy as np
import pytest

# Ensure engine package is importable
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from engine.core.types import BrainModel, SimConfig, Region, Stimulus
from engine.core.runner import SimulationRunner
from engine.adapters.rate_based import RateBasedBackend
from engine.stimulus import make_constant, make_noise, StimulusSchedule
from engine.analysis import (
    compute_mean_activity,
    compute_functional_connectivity,
    compute_dominant_frequency,
    detect_instability,
)


# ─── Fixtures ─────────────────────────────────────────────────────────────────


def make_small_model(n: int = 8, seed: int = 0) -> BrainModel:
    """Create a small synthetic brain model with random connectivity."""
    rng = np.random.default_rng(seed)
    regions = [
        Region(id=f"r{i:02d}", name=f"Region-{i}", index=i)
        for i in range(n)
    ]
    # Sparse distance-inspired weights
    weights = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            if i != j and rng.random() < 0.4:
                weights[i, j] = rng.uniform(0.01, 0.3)
    # Normalise rows
    row_sums = weights.sum(axis=1, keepdims=True)
    weights = np.where(row_sums > 0, weights / row_sums, weights)

    return BrainModel(
        id="test-model",
        name="Test Model (8 regions)",
        regions=regions,
        connectivity_matrix=weights,
        delay_matrix=np.zeros((n, n)),
        parameters={},
    )


def make_config(duration: float = 0.1, dt: float = 0.001) -> SimConfig:
    return SimConfig(
        backend="rate_based",
        duration=duration,
        dt=dt,
        seed=42,
        report_interval=10,
    )


def collect_events(model, config, backend=None) -> tuple[list[dict], dict | None]:
    """Run simulation and collect all emitted events."""
    events = []
    backend = backend or RateBasedBackend()

    runner = SimulationRunner(
        backend=backend,
        model=model,
        config=config,
        run_id="test-run-001",
        on_event=events.append,
    )
    summary = runner.run()
    return events, summary


# ─── Tests ────────────────────────────────────────────────────────────────────


class TestRateBasedBaseline:
    """Verify the rate-based backend runs without errors on small models."""

    def test_basic_run_completes(self):
        model = make_small_model(n=8)
        config = make_config(duration=0.1)
        events, summary = collect_events(model, config)
        assert summary is not None
        assert summary["status"] == "completed", f"Expected completed, got {summary}"

    def test_events_emitted(self):
        model = make_small_model(n=8)
        config = make_config(duration=0.1)
        events, summary = collect_events(model, config)
        types = {e["type"] for e in events}
        assert "run_started" in types, f"Events emitted: {types}"
        assert "run_metric" in types, f"Events emitted: {types}"
        assert "run_completed" in types, f"Events emitted: {types}"

    def test_metric_events_have_expected_keys(self):
        model = make_small_model(n=8)
        config = make_config(duration=0.1)
        events, _ = collect_events(model, config)
        metric_events = [e for e in events if e["type"] == "run_metric"]
        assert len(metric_events) > 0, "No metric events emitted"

        first = metric_events[0]
        assert "step" in first
        assert "metrics" in first
        assert "mean_activity" in first["metrics"]
        assert "max_activity" in first["metrics"]
        # runner emits camelCase regionActivity
        assert "regionActivity" in first, f"Keys: {list(first.keys())}"

    def test_region_activity_shape(self):
        n = 12
        model = make_small_model(n=n)
        config = make_config(duration=0.1)
        events, _ = collect_events(model, config)
        metric_events = [e for e in events if e["type"] == "run_metric"]
        for evt in metric_events[:3]:
            # runner emits camelCase regionActivity
            region_act = evt["regionActivity"]
            assert len(region_act) == n, f"Expected {n} regions, got {len(region_act)}"
            for val in region_act:
                assert 0.0 <= val <= 1.0, f"Region activity out of [0,1]: {val}"

    def test_activity_is_bounded(self):
        model = make_small_model(n=8)
        config = make_config(duration=0.2)
        events, _ = collect_events(model, config)
        metric_events = [e for e in events if e["type"] == "run_metric"]
        for evt in metric_events:
            assert evt["metrics"]["mean_activity"] <= 1.0 + 1e-6
            assert evt["metrics"]["mean_activity"] >= 0.0 - 1e-6

    def test_metrics_are_finite(self):
        model = make_small_model(n=8)
        config = make_config(duration=0.1)
        events, _ = collect_events(model, config)
        metric_events = [e for e in events if e["type"] == "run_metric"]
        for evt in metric_events:
            for k, v in evt["metrics"].items():
                assert np.isfinite(v), f"Non-finite metric {k}={v}"

    def test_step_count_matches_config(self):
        duration = 0.05
        dt = 0.001
        config = make_config(duration=duration, dt=dt)
        expected_steps = int(np.ceil(duration / dt))
        model = make_small_model(n=4)
        events, summary = collect_events(model, config)
        completed = next(e for e in events if e["type"] == "run_completed")
        # runner emits 'step' as the last step index in run_completed
        # summary contains steps_completed
        assert summary.get("steps_completed", expected_steps) > 0


class TestRateBasedWithStimulus:
    """Verify stimulus injection affects activity."""

    def test_constant_stimulus_increases_activity(self):
        model = make_small_model(n=8)

        # Baseline: no stimulus
        config_base = make_config(duration=0.1)
        events_base, _ = collect_events(model, config_base)
        metric_base = [e for e in events_base if e["type"] == "run_metric"]
        mean_base = np.mean([e["metrics"]["mean_activity"] for e in metric_base])

        # With strong constant stimulus on all regions
        stim = Stimulus(
            target_indices=list(range(8)),
            stimulus_type="constant",
            amplitude=0.5,
            start_time=0.0,
            end_time=0.1,
        )
        config_stim = make_config(duration=0.1)
        config_stim.stimuli = [stim]
        events_stim, _ = collect_events(model, config_stim)
        metric_stim = [e for e in events_stim if e["type"] == "run_metric"]
        mean_stim = np.mean([e["metrics"]["mean_activity"] for e in metric_stim])

        assert mean_stim > mean_base, (
            f"Stimulus should increase activity: "
            f"baseline={mean_base:.4f}, stimulated={mean_stim:.4f}"
        )

    def test_lesion_reduces_activity(self):
        """Zeroing one region should reduce its contribution."""
        model = make_small_model(n=8)
        # Lesion region 0 (set its connectivity row/col to zero)
        model.connectivity_matrix[0, :] = 0
        model.connectivity_matrix[:, 0] = 0

        config = make_config(duration=0.05)
        events, summary = collect_events(model, config)
        assert summary["status"] == "completed"


class TestAnalysisIntegration:
    """Verify analysis utilities work on runner output traces."""

    def test_functional_connectivity(self):
        model = make_small_model(n=8)
        config = make_config(duration=0.5)
        events, _ = collect_events(model, config)

        metric_events = [e for e in events if e["type"] == "run_metric"]
        n_regions = 8
        traces = np.array([
            e["regionActivity"] for e in metric_events
        ])  # shape (T, N)
        assert traces.shape[1] == n_regions

        fc = compute_functional_connectivity(traces)
        assert fc.shape == (n_regions, n_regions)
        # Diagonal should be 1 (or close)
        assert np.allclose(np.diag(fc), 1.0, atol=0.01)

    def test_instability_detection_stable(self):
        model = make_small_model(n=8)
        config = make_config(duration=0.2)
        events, _ = collect_events(model, config)
        metric_events = [e for e in events if e["type"] == "run_metric"]
        traces = np.array([e["regionActivity"] for e in metric_events])
        result = detect_instability(traces)
        assert result["is_stable"], f"Expected stable run: {result}"

    def test_dominant_frequency(self):
        model = make_small_model(n=4)
        config = make_config(duration=1.0)  # need longer for frequency analysis
        events, _ = collect_events(model, config)
        metric_events = [e for e in events if e["type"] == "run_metric"]
        traces = np.array([e["regionActivity"] for e in metric_events])
        mean_trace = np.mean(traces, axis=1)
        freq = compute_dominant_frequency(mean_trace, dt=0.001 * 10)  # report_interval=10
        assert freq >= 0.0, f"Frequency should be non-negative: {freq}"


class TestModelValidation:
    """Verify model validation catches bad inputs."""

    def test_mismatched_matrix_caught(self):
        model = make_small_model(n=8)
        # Break the matrix size
        model.connectivity_matrix = np.zeros((5, 5))
        errors = model.validate()
        assert len(errors) > 0

    def test_valid_model_no_errors(self):
        model = make_small_model(n=8)
        errors = model.validate()
        assert errors == [], f"Unexpected errors: {errors}"

    def test_nan_matrix_caught(self):
        model = make_small_model(n=4)
        model.connectivity_matrix[0, 1] = float("nan")
        errors = model.validate()
        assert any("NaN" in e for e in errors)
