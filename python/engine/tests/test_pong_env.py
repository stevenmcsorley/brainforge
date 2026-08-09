"""Tests for the Pong environments.

The predictive environment exists to make rally rate a trustworthy measure of
skill. These tests pin down the properties that make it trustworthy, so a
future physics change cannot silently reintroduce the confound that made an
earlier interception experiment look like a success when it was not.
"""
import numpy as np
import pytest

from engine.experiments.pong_env import (
    PredictivePongEnv,
    SpinPongEnv,
    policy_baselines,
)


def _run(env, policy, frames=60000):
    for i in range(frames):
        if policy == "static":
            target = env.paddle_brain
        elif policy == "flail":
            target = 50 + 40 * np.sin(i * 0.05)
        elif policy == "track":
            target = env.last_seen_y
        elif policy == "predict":
            target = env.predicted_landing()
        else:
            raise ValueError(policy)
        env.move_paddle(target)
        env.physics()
    return env.rally_rate


@pytest.fixture(scope="module")
def baselines():
    return policy_baselines()


def test_motion_alone_earns_nothing(baselines):
    """The core fix: a flailing paddle must not outscore a stationary one.

    With the browser physics, paddle offset adds spin and extends rallies, so
    motion inflated rally rate regardless of accuracy.
    """
    assert baselines["flail"] <= baselines["static"] + 0.02, (
        f"flailing scored {baselines['flail']} vs static {baselines['static']} — "
        "paddle motion is being rewarded on its own"
    )


def test_task_requires_prediction(baselines):
    """Tracking the last-seen position must be clearly worse than extrapolating."""
    assert baselines["track"] < 0.4, f"position tracking scored {baselines['track']}"
    assert baselines["predict"] > 0.8, f"extrapolation scored {baselines['predict']}"
    assert baselines["predict"] > baselines["track"] * 2


def test_stationary_paddle_is_weak(baselines):
    """A do-nothing policy should score poorly, or improvements are unreadable."""
    assert baselines["static"] < 0.2


def test_blackout_freezes_observation():
    """Past blind_x the last-seen values must stop updating."""
    env = PredictivePongEnv(seed=1)
    while env.bx < env.blind_x:
        env.physics()
    seen_y, seen_vy = env.last_seen_y, env.last_seen_vy
    for _ in range(5):
        if env.bx >= 93.0:
            break
        env.physics()
        assert env.last_seen_y == seen_y
        assert env.last_seen_vy == seen_vy


def test_paddle_is_slew_limited():
    env = PredictivePongEnv(seed=1, slew=1.5)
    start = env.paddle_brain
    env.move_paddle(start + 100.0)
    assert env.paddle_brain - start == pytest.approx(1.5)


def test_every_point_reserves_the_ball():
    """Independent trials: no rally length for a policy to exploit."""
    env = PredictivePongEnv(seed=3)
    for _ in range(20000):
        if env.physics() != 0:
            assert env.bx == pytest.approx(5.0)
            return
    pytest.fail("no point was scored within the frame budget")


def test_spin_env_still_has_spin():
    """SpinPongEnv is kept for UI parity and should retain the original physics."""
    env = SpinPongEnv(seed=1)
    env.paddle_brain = 50.0
    env.bx, env.by, env.vx, env.vy = 92.5, 55.0, 0.6, 0.0
    env.physics()
    assert env.vy != 0.0, "spin term missing from the UI-parity environment"
