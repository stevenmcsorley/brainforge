"""Headless Pong environments for closed-loop training and evaluation.

`SpinPongEnv` mirrors the physics in `apps/web/src/components/environments/
BrainPong.tsx`, including the spin that a paddle hit imparts. `PredictivePongEnv`
removes that spin and adds a sensory blackout, which makes it a valid test of
predictive control.

**Why the spin matters.** In the browser physics a hit adds
``vy += (ball.y - paddle.y) * 0.1``. Rally length therefore grows with paddle
*motion* rather than accuracy: a paddle that flails imparts spin and keeps
points alive. Measured on a predictive variant of the task, rally rate rose in
both the plasticity-on and plasticity-off arms while interception error grew
*worse* than a stationary paddle's. Rally rate was reporting the wrong thing.

**What makes the predictive task valid.** The ball is only observable while
``bx < blind_x``; past that the controller must extrapolate from the last
sighting. The paddle is slew-limited, so it cannot snap to a target. Measured
policy baselines over ~1400 trials:

===========================  ==========
policy                       rally rate
===========================  ==========
stationary                        0.078
flailing (motion, no info)        0.080
track last-seen position          0.205
extrapolate from velocity         0.915
===========================  ==========

A position reflex scores 0.205; only using velocity reaches 0.915. Flailing
does not beat standing still, so paddle motion alone earns nothing.

Always sanity-check a new task against these do-nothing and oracle policies
before interpreting a learning curve on it.
"""

from typing import Optional

import numpy as np


class SpinPongEnv:
    """Pong matching the browser physics, spin included.

    Kept for parity with the UI. Do not use it to measure interception skill —
    see the module docstring.
    """

    def __init__(self, seed: int = 0, paddle_half: float = 10.0):
        self.rng = np.random.default_rng(seed)
        self.paddle_half = paddle_half
        self.paddle_brain = 50.0
        self.paddle_user = 50.0
        self.hits = 0
        self.misses = 0
        self.reset_ball()

    def reset_ball(self) -> None:
        self.bx, self.by = 50.0, float(self.rng.uniform(20, 80))
        self.vx = 0.6
        self.vy = float(self.rng.uniform(-0.5, 0.5)) or 0.4

    def physics(self) -> int:
        self.bx += self.vx
        self.by += self.vy
        self.paddle_user += (self.by - self.paddle_user) * 0.15
        self.paddle_user = float(np.clip(self.paddle_user, 10, 90))
        if self.by <= 0 or self.by >= 100:
            self.vy *= -1
        ev = 0
        if self.vx < 0 and self.bx <= 7 and abs(self.by - self.paddle_user) <= self.paddle_half:
            self.vx *= -1
            self.vy += (self.by - self.paddle_user) * 0.1
        if self.vx > 0 and self.bx >= 93 and abs(self.by - self.paddle_brain) <= self.paddle_half:
            self.vx *= -1
            self.vy += (self.by - self.paddle_brain) * 0.1   # the confound
            self.hits += 1
            ev = 1
        if self.bx <= 0:
            self.reset_ball()
        elif self.bx >= 100:
            self.misses += 1
            ev = -1
            self.reset_ball()
        return ev


class PredictivePongEnv:
    """Spin-free Pong with a sensory blackout, for measuring predictive control.

    Each point is independent — the ball is re-served after every hit or miss —
    so there is no rally length to extend and paddle motion earns nothing on its
    own.
    """

    def __init__(self, seed: int = 0, paddle_half: float = 4.0, speed: float = 2.0,
                 vy_range: float = 1.6, blind_x: float = 60.0, slew: float = 1.5,
                 serve_random: bool = True):
        self.rng = np.random.default_rng(seed)
        self.paddle_half = paddle_half
        self.speed = speed
        self.vy_range = vy_range
        self.blind_x = blind_x
        self.slew = slew
        self.serve_random = serve_random
        self.paddle_brain = 50.0
        self.hits = 0
        self.misses = 0
        self.intercept_err_sum = 0.0
        self.intercept_err_n = 0
        self.last_seen_y = 50.0
        self.last_seen_vy = 0.0
        self.reset_ball()

    def reset_ball(self) -> None:
        self.bx = 5.0
        self.by = float(self.rng.uniform(10, 90)) if self.serve_random else 50.0
        self.vx = self.speed
        self.vy = float(self.rng.uniform(-self.vy_range, self.vy_range))
        self.last_seen_y = self.by
        self.last_seen_vy = self.vy

    def landing_point(self) -> float:
        """Where the ball will cross the paddle plane, reflecting off walls."""
        if self.vx <= 0:
            return self.by
        t = (93.0 - self.bx) / max(self.vx, 1e-6)
        y = self.by + self.vy * t
        y = abs(y) % 200.0
        return 200.0 - y if y > 100.0 else y

    def predicted_landing(self) -> float:
        """Oracle extrapolation from the last sighting — the 0.915 policy."""
        t = (93.0 - min(self.bx, self.blind_x)) / max(self.vx, 1e-6)
        y = self.last_seen_y + self.last_seen_vy * t
        y = abs(y) % 200.0
        return 200.0 - y if y > 100.0 else y

    def move_paddle(self, target: float) -> None:
        d = float(target) - self.paddle_brain
        self.paddle_brain = float(np.clip(
            self.paddle_brain + np.clip(d, -self.slew, self.slew), 0.0, 100.0))

    def physics(self) -> int:
        if self.bx < self.blind_x:
            self.last_seen_y = self.by
            self.last_seen_vy = self.vy
        self.bx += self.vx
        self.by += self.vy
        if self.by <= 0.0:
            self.by = -self.by
            self.vy = -self.vy
        elif self.by >= 100.0:
            self.by = 200.0 - self.by
            self.vy = -self.vy

        if self.vx > 0:
            self.intercept_err_sum += abs(self.paddle_brain - self.landing_point())
            self.intercept_err_n += 1

        ev = 0
        if self.vx > 0 and self.bx >= 93.0:
            if abs(self.by - self.paddle_brain) <= self.paddle_half:
                self.hits += 1
                ev = 1
            else:
                self.misses += 1
                ev = -1
            self.reset_ball()
        return ev

    @property
    def rally_rate(self) -> float:
        n = self.hits + self.misses
        return self.hits / n if n else 0.0


def policy_baselines(seed: int = 42, frames: int = 60000,
                     env_kwargs: Optional[dict] = None) -> dict:
    """Score reference policies, for validating a task before trusting a result."""
    out = {}
    for mode in ("static", "flail", "track", "predict"):
        env = PredictivePongEnv(seed=seed, **(env_kwargs or {}))
        for i in range(frames):
            if mode == "static":
                target = env.paddle_brain
            elif mode == "flail":
                target = 50 + 40 * np.sin(i * 0.05)
            elif mode == "track":
                target = env.last_seen_y
            else:
                target = env.predicted_landing()
            env.move_paddle(target)
            env.physics()
        out[mode] = env.rally_rate
    return out
