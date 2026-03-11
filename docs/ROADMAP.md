# BRAINFORGE — Technical Roadmap

## Phase 1 — Foundation (Current)
**Status: Complete (scaffold)**

- [x] Monorepo with shared contracts and types
- [x] NestJS API with all core modules
- [x] Python simulation engine with 3 backends
- [x] React frontend with all main pages
- [x] Docker Compose orchestration
- [x] Prisma schema + seed data
- [x] Redis job queue (BullMQ) + Pub/Sub telemetry
- [x] WebSocket telemetry gateway
- [x] Sample synthetic connectome dataset

**To verify (first run):**
- [ ] End-to-end simulation dispatch and telemetry
- [ ] Live monitor streaming from WebSocket
- [ ] Run artifact storage and retrieval

---

## Phase 2 — First Working Simulation
**Estimated: 2–3 weeks**

- [ ] Wire experiment → run → worker dispatch fully
- [ ] Test rate-based backend with real seed data
- [ ] LiveMonitorPage connected to real WebSocket events
- [ ] Run artifacts saved and retrievable via API
- [ ] Compare two completed runs via CompareRunsPage
- [ ] API Swagger/OpenAPI documentation
- [ ] Basic unit tests for Python backends
- [ ] Integration test for the job dispatch loop

---

## Phase 3 — Multiscale Expansion
**Estimated: 3–4 weeks**

- [ ] Validate spiking (LIF) backend end-to-end
- [ ] Validate whole-brain (Kuramoto) backend end-to-end
- [ ] Stimulus injection UI (define stimulation in experiment builder)
- [ ] Lesion/silencing experiments
- [ ] Parameter sweep runner (batch mode via BullMQ)
- [ ] Sweep results aggregation and comparison
- [ ] Model registry improvements (versioning, forking)
- [ ] Dataset import UI (CSV/NPZ upload)
- [ ] Experiment templates in the UI

---

## Phase 4 — 3D / Atlas / Rich Visualisation
**Estimated: 3–5 weeks**

- [ ] Replace placeholder sphere nodes with a real 3D cortical surface mesh (FreeSurfer pial surface)
- [ ] Region activation heatmap overlay on 3D surface
- [ ] Connectivity matrix viewer with colour-coded edges
- [ ] Timeline scrubber for replaying run activity
- [ ] Animated state transitions in the visual explorer
- [ ] Functional connectivity (FC) matrix display
- [ ] Power spectrum view per region
- [ ] Clustering / state-space view (PCA or UMAP on region activity)

---

## Phase 5 — Closed-Loop Embodiment
**Estimated: 4–6 weeks**

- [ ] Abstract environment interface (sensor → brain → action)
- [ ] Toy environments:
  - [ ] Simple cursor task (1D motor output)
  - [ ] Point-mass agent in 2D space
  - [ ] Grid world with sensory fields mapped to brain regions
- [ ] Decoding layer: population vector readout from region activity
- [ ] Encoding layer: visual/sensory input → region activation
- [ ] Real-time embedded loop running inside sim-worker
- [ ] Embodied experiment templates in UI

---

## Phase 6 — Hardening and Scaling
**Estimated: 4–8 weeks**

- [ ] Comprehensive test suite (unit + integration + E2E)
- [ ] Performance profiling of Python backends (NumPy vectorisation audit)
- [ ] Optional PyTorch GPU acceleration for large networks (N > 200 regions)
- [ ] Worker pool support (multiple sim-worker instances)
- [ ] Proper auth (JWT / OAuth2 — replace dev `X-Dev-User` header)
- [ ] Object storage backend for run artifacts (S3-compatible)
- [ ] Structured logging with log aggregation (Loki or ELK)
- [ ] Prometheus metrics endpoint + Grafana dashboard for system health
- [ ] API rate limiting and request validation middleware
- [ ] Comprehensive error handling and user-visible feedback
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Helm chart for Kubernetes deployment

---

## Future Directions (No Timeline)

- **Real connectome data ingestion** — HCP, UK Biobank, Allen Brain Atlas
- **TVB (The Virtual Brain) adapter** — wrap TVB as a backend option
- **Multi-region spiking with NEST or Brian2** — detailed network adapter
- **Perturbation comparison studies** — systematic lesion vs. stimulation
- **Neural decoding experiments** — train classifiers on region activity
- **Multi-subject analysis** — compare across virtual subjects
- **Real-time EEG/fMRI data injection** — closed-loop neurofeedback prototype
