# BRAINFORGE — Known Limitations

This document honestly describes the current limitations and design boundaries of BRAINFORGE v0.1.

---

## Scientific Limitations

### Biological Fidelity
- Region-level abstractions do not capture individual neuron morphology, axon conduction velocity distributions, or local circuit microcircuitry
- The spiking backend uses point-neuron LIF models — no dendritic computation, no cable theory, no ion channel kinetics
- Structural connectivity weights in the sample dataset are **synthetic** — do not use for any scientific conclusion
- No modelling of neurotransmitter dynamics, receptor subtypes, or neuromodulation (dopamine, serotonin, etc.)
- No modelling of glial cells, neurovascular coupling, or metabolic constraints

### Plasticity and closed-loop learning
- The default `rate_based` Oja rule performs no credit assignment and has not
  been shown to learn any task; with it, Brain-Pong rally rate declines over a
  session as weights diverge into their clip ceiling
- The `three_factor` backend does improve Pong tracking (see README), but this
  is one task on one model. Nothing here demonstrates general learning ability
- The improvement is not a task-specific mapping. Sensory→motor edges change at
  0.94x the network-average rate and many weights saturate at the clip ceiling,
  so the gain is better described as a broad shift in network excitability that
  suits the readout than as a learned sensorimotor pathway
- **Predictive control is not learned.** On the de-confounded
  `PredictivePongEnv` (baselines: stationary 0.078, position-tracking 0.205,
  velocity extrapolation 0.915), five seeds of 600 s training evaluated with
  plasticity frozen gave +0.000 rally improvement with plasticity on versus
  +0.033 with it off (difference −0.033, t = −1.76). The control also improved
  more on interception error (−0.040 vs −0.008). Final performance ~0.10 sits
  between doing nothing and tracking, far below extrapolation
- This is a clean negative, not a null: position, velocity and landing point are
  all linearly decodable from network activity (r = 0.968, 0.965, 0.934), so the
  task is solvable in principle and the limit is the learning rule. A single
  global scalar gating every eligible synapse can shift network excitability —
  which is what produced the tracking gain — but cannot sculpt a structured
  input→output mapping such as `landing = f(position, velocity)`
- `node_perturb` adds the missing spatial credit assignment (34/68 rows up,
  34 down on one reward, against 58/10 for `three_factor`) and does better on
  the predictive task: +0.064 held-out rally against a +0.033 control, where
  three_factor scored +0.000. It is still not a result — t = 1.41 at n = 5,
  interception error improves *less* than in the control, and final performance
  (~0.13) is below the position-tracking baseline of 0.205
- The limit on `node_perturb` is REINFORCE's gradient variance, not readout
  coupling. Coupling the readout to all 68 regions was tested directly and did
  **not** help: +0.028 against a frozen-weight control, t = 0.76, with one seed
  of five going backwards. The estimator draws one sample of a 69-dimensional
  gradient per frame while the reward depends on all 69 perturbations jointly,
  giving roughly 540 effective samples per dimension over 600 s of training —
  far too few, and the ball's randomness adds further reward variance
- Weak readout coupling is nonetheless real and compounds it: with a 3-region
  readout in a 68-region network and per-hop gain ~0.005, a perturbation
  explains only 0.4–2.7% of readout variance and raising `pert_sigma` 8× does
  not change that
- **The substrate is not the limit; the learning rule is.** Given identical
  network activity and the identical 69 readout weights, closed-form supervised
  regression reaches r = 0.846 and lands within the paddle 67.4% of the time,
  while REINFORCE on those same weights reaches +0.028 (t = 0.76, noise). The
  network represents the task — ball position, velocity and landing point decode
  at r = 0.968, 0.965 and 0.934 — and a fitted readout plays a perfect game.
  What fails is learning that readout from a scalar reward
- This is the known credit-assignment gap between biologically-plausible
  plasticity and gradient methods, not a defect specific to this platform.
  Reward-modulated Hebbian rules are weak at acquiring input→output functions
- Before designing a task, check the ceiling. A *perfectly fitted* linear
  population readout achieves 11.3 units of mean landing-point error against a
  4-unit paddle — in range only 26% of the time. The original predictive task
  was therefore unsolvable by any linear readout on this network, independent of
  learning. At `paddle_half=12` a fitted readout reaches 0.571 against 0.212 for
  a stationary paddle, which is a difficulty where learning could show
- Rally rate alone is not a valid skill metric on every task variant. Before
  trusting a learning curve, score the task with
  `engine.experiments.pong_env.policy_baselines()` and check that a do-nothing
  policy is weak and a flailing one earns nothing
- Sensory→motor transmission is weak regardless of region choice: end-to-end
  gain from an injected stimulus to a downstream region's activity is ~3e-4.
  Mean-field normalisation (`w/N * coupling` ≈ 0.005 at N=68) holds total
  per-region drive around 0.065, far below the sigmoid threshold of 0.5, so
  the network is sustained mostly by noise rather than by coupling
- The reward signal is additive with a 1 s decay, so bursts scale the weight
  update by ~500× over baseline and drive weights into their clip ceiling
- With `alpha = N` the Oja fixed point is `W* = x_pre / (N · x_post)`, the same
  order as the initial weights, leaving little dynamic range before the reward
  multiplier dominates
- No claim is made that plasticity here reproduces biological synaptic learning

### Scale
- The current backends are tested on N ≤ 68 regions (Desikan-Killiany scale)
- Spiking backend with populations of N_pop = 50 neurons per region runs acceptably on CPU
- For N > 200 regions or N_pop > 500 neurons, expect significant performance degradation
- No GPU support currently (planned for Phase 6)

### Determinism
- Rate-based and whole-brain backends are fully deterministic given the same seed
- Spiking backend includes stochastic elements (Poisson noise, reset noise) — partially deterministic per seed
- Parallel job execution does not guarantee ordering of Redis Pub/Sub event delivery

---

## Software Limitations

### Authentication
- Current auth is purely a dev mock (`X-Dev-User` header, no verification)
- No multi-user support, no RBAC, no token expiry
- Do **not** expose this to a network without adding real authentication first

### Storage
- Simulation artifacts (traces, metrics) are saved to the container filesystem (`/storage` volume)
- No S3/GCS/object store integration — data does not survive container recreation without volume backup
- Large runs (N=68, T=10,000 steps) produce ~5–20MB trace files — disk usage will accumulate

### Data Import
- No UI for dataset file upload (API endpoint exists but no frontend form)
- Connectivity matrices must match the expected NPZ format exactly
- No validation of numeric stability of imported connectivity matrices

### Frontend
- VisualExplorer 3D view uses sphere geometry, **not** real cortical surface meshes
- No region-to-surface mapping without external atlas data
- Compare Runs page operates on pre-saved artifact files — not real-time
- No mobile/tablet layout — designed for desktop ≥ 1280px wide

### Worker and Job Queue
- Single sim-worker instance (no horizontal scaling without manual config changes)
- No job cancellation signal propagation to the Python runner if the worker crashes mid-run
- BullMQ job visibility timeout: if worker crashes, jobs may be retried automatically

### API
- No Swagger/OpenAPI documentation page (planned for Phase 2)
- No pagination cursor — offset-based pagination only
- No rate limiting — all requests treated equally

---

## Operational Limitations

### Local Dev Only
- Docker Compose setup is for local development, not production
- No TLS configuration, secrets management, or production hardening
- Postgres is single-node with no replication or backup

### Performance
- Prisma ORM adds overhead for large relational queries (e.g. fetching 10,000 connections)
- No caching layer for frequently queried model data
- WebSocket fanout becomes a bottleneck at high telemetry event rates (> 1000 events/sec)

---

## Ethical and Scope Limitations

BRAINFORGE explicitly does **not** claim to:
- Simulate consciousness, sentience, or subjective experience
- Produce scientifically valid predictions about real human brain function
- Replicate specific empirical neuroscience findings without real connectome data
- Act as a medical device or clinical tool

This platform is a research engineering tool for studying large-scale computational dynamics of brain-like networks. All scientific claims derived from simulations performed on synthetic data should be clearly labelled as simulation artifacts.
