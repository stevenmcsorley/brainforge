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
- The Hebbian (Oja's rule) implementation runs, but has **not** been shown to
  learn any task. In Brain-Pong on DK68 the rally rate declines over a session
  as weights diverge — see the Brain-Pong section of the README for measurements
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
