"""Closed-loop training configurations.

The interactive environments (Pong, Braitenberg, CartPole) form a sensorimotor
loop: an environment variable is injected as current into sensory regions, a
readout of motor-region activity drives an actuator, and outcomes are returned
as reward. With the `three_factor` backend that loop can actually train — see
`training_experiment` for the settings this was verified at.

Three things had to be right at once, and each was measured:

**Network gain.** At the rate_based defaults (`global_coupling` 0.5,
`threshold` 0.5) mean-field normalisation gives effective weights of
w/N * coupling ~ 0.005 on a 68-region model. Total per-region drive is then
~0.065 against a sigmoid threshold of 0.5, so the network sits far below
threshold and is sustained mostly by noise. End-to-end gain from a sensory
stimulus to a downstream region is ~3e-4. Raising coupling to 2.0 lifts the
network into the sigmoid's responsive range.

**Readout.** Motor activity has a standard deviation around 0.008. Normalising
it with adaptive min/max bounds latches onto extremes and then amplifies noise;
a running z-score over a motor *population* preserves the signal. This mattered
more than anything else: a linear decoder over unmodified network activity plays
a perfect game, which showed the information was always present and the readout
was discarding it.

**Learning rule.** Oja's rule cannot assign credit — its modulator is a global
scalar, so every eligible synapse moves together. `three_factor` adds an
eligibility trace and a signed reward prediction error.

**Population coding, and what did not help.** Encoding the environment variable
across a bank of regions with graded (Gaussian) tuning gives distinguishable
activity patterns for different values. Brain *size* does not help: ball
position decodes at r ~ 0.93-0.96 on the mouse connectome (N=33), DK68 (68),
AAL-90 (90), Schaefer-100 (100) and Schaefer-400 (400) alike, and a
three-variable capacity test is likewise flat.

Measured on DK68 Pong, five seeds, 600 s of training, evaluated with plasticity
frozen on an unseen ball sequence: rally rate 0.285 -> 0.787 (+0.502, positive
in 5/5 seeds). A static paddle scores 0.278 and a perfect one 1.000.

**Reward does not work for control tasks that require a computation.** On the
predictive interception variant, where the actuator must extrapolate from
velocity rather than track a current position, every reward-driven method
failed against its control: three-factor +0.000, node perturbation +0.064
(t = 1.41), population readout + REINFORCE +0.028 (t = 0.76). Fitting the
readout supervised instead reaches 0.68-0.75 against a stationary baseline of
0.212 — roughly four times better than anything reward achieved. Layering
reward fine-tuning on top of that fitted readout adds nothing measurable
(0.680 -> 0.696, t = 0.26, interception error unchanged).

Use `fit_readout` from `engine.analysis.readout` for control tasks. Reward
modulation is retained for studying plasticity dynamics — the tracking result
above is real — but it is not the route to a working controller.
"""

from typing import Any, Dict, List, Optional


#: Network parameters that keep a rate-based model responsive rather than
#: saturated or noise-dominated. Verified on DK68; re-check on other models by
#: confirming mean activity settles well inside (0, 1).
CLOSED_LOOP_NETWORK_PARAMS: Dict[str, float] = {
    "tau": 0.01,
    "gain": 1.0,
    "noise_sigma": 0.05,
    "global_coupling": 2.0,
    "threshold": 0.5,
}

#: Plasticity parameters for the three_factor backend.
CLOSED_LOOP_PLASTICITY_PARAMS: Dict[str, float] = {
    "learning_rate": 0.5,
    # Eligibility decay should span the gap between an action and its outcome.
    "trace_tau": 0.3,
    "rpe_tau": 3.0,
    "weight_decay": 1e-3,
}

#: DK68 atlas indices. Sensory bank spans both hemispheres' visual regions so a
#: graded code has enough distinct channels; motor pool is sensorimotor cortex.
DK68_SENSORY_BANK: List[int] = [3, 9, 11, 19, 37, 43, 45, 53]
DK68_MOTOR_POOL: List[int] = [15, 20, 22]


def training_experiment(
    model_id: str,
    environment: str = "pong",
    duration: float = 600.0,
    dt: float = 0.001,
    seed: int = 42,
    sensory_nodes: Optional[List[int]] = None,
    motor_nodes: Optional[List[int]] = None,
    plasticity: bool = True,
    name: str = "Closed-loop training",
    description: str = "Sensorimotor training with three-factor plasticity",
    tags: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Config for a closed-loop training run.

    Set ``plasticity=False`` to produce the matched control. The control is not
    optional in practice: the readout's running normaliser improves on its own
    over a session, so a learning curve without a plasticity-off comparison
    cannot distinguish learning from that warm-up.
    """
    return {
        "name": name,
        "description": description,
        "modelId": model_id,
        "tags": tags or ["closed-loop", "training", environment],
        "config": {
            "backend": "three_factor",
            "duration": duration,
            "dt": dt,
            "seed": seed,
            "reportInterval": 100,
            "parameters": {
                **CLOSED_LOOP_NETWORK_PARAMS,
                **CLOSED_LOOP_PLASTICITY_PARAMS,
                "plasticity_enabled": plasticity,
            },
            "environment": {
                "type": environment,
                "sensoryNodes": sensory_nodes or DK68_SENSORY_BANK,
                "motorNodes": motor_nodes or DK68_MOTOR_POOL,
            },
            "stimuli": [],
        },
    }


def control_experiment(
    model_id: str,
    environment: str = "pong",
    duration: float = 600.0,
    dt: float = 0.001,
    seed: int = 42,
    sensory_nodes: Optional[List[int]] = None,
    motor_nodes: Optional[List[int]] = None,
    name: str = "Closed-loop control (fitted readout)",
    description: str = (
        "Sensorimotor control with a supervised readout and no reward "
        "modulation. See engine.analysis.readout.fit_readout."),
    tags: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Config for a control task driven by a fitted readout, with reward off.

    This is the configuration to use for control. Reward-modulated plasticity is
    disabled because it was measured not to help: on predictive interception it
    reached at best +0.064 (t = 1.41) against its control, while a fitted readout
    reaches 0.68-0.75, and adding reward on top of that readout changed nothing
    (t = 0.26). Fit the readout with `fit_readout` on a teacher-forced rollout
    and drive the actuator from `LinearReadout.predict`.
    """
    return {
        "name": name,
        "description": description,
        "modelId": model_id,
        "tags": tags or ["closed-loop", "control", "fitted-readout", environment],
        "config": {
            "backend": "rate_based",
            "duration": duration,
            "dt": dt,
            "seed": seed,
            "reportInterval": 100,
            "parameters": {
                **CLOSED_LOOP_NETWORK_PARAMS,
                "plasticity_enabled": False,
            },
            "environment": {
                "type": environment,
                "sensoryNodes": sensory_nodes or DK68_SENSORY_BANK,
                "motorNodes": motor_nodes or DK68_MOTOR_POOL,
            },
            "stimuli": [],
        },
    }


def training_control_pair(model_id: str, **kwargs) -> List[Dict[str, Any]]:
    """A training run and its matched plasticity-off control, same seed."""
    return [
        training_experiment(model_id, plasticity=True,
                            name="Closed-loop training (plasticity on)", **kwargs),
        training_experiment(model_id, plasticity=False,
                            name="Closed-loop control (plasticity off)", **kwargs),
    ]
