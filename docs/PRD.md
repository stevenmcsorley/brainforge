# BRAINFORGE — Product Requirements Document

**Version:** 0.1.0
**Date:** 2026-03-10
**Status:** Active Development

---

## 1. Product Overview

BRAINFORGE is a research-grade software platform for large-scale brain simulation. It provides a modular, extensible environment where neuroscience researchers and computational modellers can define brain models at multiple scales, run simulations using pluggable backends, inspect activity dynamics, compare experimental runs, and optionally connect brain models to embodied agents.

BRAINFORGE is NOT an artificial general intelligence system. It does NOT claim to simulate consciousness. It IS a serious simulation workbench for computational neuroscience research.

## 2. Target Users

- **Computational neuroscientists** running whole-brain or circuit-level simulations
- **Graduate researchers** exploring network dynamics and connectivity
- **Simulation engineers** building and validating neural models
- **Lab groups** needing experiment management, reproducibility, and comparison tools

## 3. Core Capabilities

### 3.1 Model Definition & Registry
- Define brain models composed of regions, populations, and connectivity
- Store models with versioning and provenance metadata
- Support multiple scales: region-level, circuit-level, population-level
- Import connectivity matrices and atlas metadata from standard formats

### 3.2 Simulation Execution
- Run simulations using pluggable backend adapters
- Support rate-based, spiking, and coarse whole-brain dynamics
- Deterministic seeding for reproducibility
- Step/pause/resume/stop lifecycle control
- Checkpointing and snapshotting mid-run
- Live telemetry streaming via WebSocket

### 3.3 Experiment Management
- Define experiments with parameter configurations
- Queue and execute simulation runs
- Support parameter sweeps and batch studies
- Compare runs side-by-side
- Template common experiment patterns

### 3.4 Stimulus & Perturbation
- Inject external stimuli into regions or populations
- Define time-scheduled stimulation protocols
- Support lesion studies (silencing regions)
- Generic parameter modifiers (pharmacology-like)
- Noise injection

### 3.5 Visualisation
- 2D region graph views
- 3D brain/atlas visualisation
- Activation heatmaps over time
- Time-series traces per region/population
- Connectivity matrix explorer
- Run comparison dashboards
- Live telemetry panels

### 3.6 Data Management
- Import/export connectivity matrices (CSV, JSON, NPZ)
- Import atlas and region metadata
- Store run artifacts (traces, snapshots, metrics)
- Export results in JSON, CSV, Parquet formats

### 3.7 Embodied/Closed-Loop (Extension)
- Optional module for connecting brain models to environments
- Sensor-to-brain input pathways
- Brain-to-action output decoding
- Toy environments: grid world, point-mass, cursor control

## 4. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Local dev startup | < 2 minutes with Docker Compose |
| Simulation of 100-region model, 10s sim time | < 30s on modern laptop |
| UI responsiveness | < 200ms for navigation, < 1s for data loads |
| WebSocket latency | < 100ms for telemetry updates |
| Checkpoint/restore | Exact state reproduction |
| Data export | CSV/JSON/Parquet for all run data |

## 5. Quality Attributes

- **Reproducibility:** Deterministic seeds, versioned configs, immutable run records
- **Modularity:** Each subsystem replaceable independently
- **Observability:** Structured logging, metrics, health endpoints
- **Extensibility:** Adapter pattern for simulation backends
- **Maintainability:** Clean separation of concerns, typed contracts

## 6. Out of Scope (v0.1)

- Multi-user auth / RBAC (dev-only local auth)
- Cloud deployment automation
- GPU-accelerated simulation backends
- Real MRI/fMRI data import pipelines
- Publication-quality figure export
- Integration with NEST, Brian2, TVB (future adapter targets)

## 7. Success Criteria for v0.1

1. A researcher can load a sample connectome dataset
2. Define a brain model with 68+ regions and weighted connectivity
3. Run a rate-based simulation for configurable duration
4. View live activity traces during simulation
5. Save and replay completed runs
6. Compare two runs with different parameters
7. Apply a stimulus to a region and observe the effect
8. Export run data for external analysis
