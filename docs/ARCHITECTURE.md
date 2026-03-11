# BRAINFORGE — System Architecture

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (React/Vite)                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐│
│  │Models│ │Data  │ │Expts │ │Live  │ │Visual│ │Compare   ││
│  │      │ │sets  │ │      │ │Mon.  │ │Explr.│ │Runs      ││
│  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───────┘│
│     │        │        │     WS │        │        │         │
└─────┼────────┼────────┼────────┼────────┼────────┼─────────┘
      │ REST   │ REST   │ REST   │        │ REST   │ REST
┌─────┴────────┴────────┴────────┴────────┴────────┴─────────┐
│                    API GATEWAY (NestJS)                      │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   │
│  │Models│ │Data  │ │Expts │ │Runs  │ │Telem.│ │Admin │   │
│  │Module│ │Module│ │Module│ │Module│ │Module│ │Module│   │
│  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──────┘   │
│     │        │        │        │        │                   │
│  ┌──┴────────┴────────┴────────┴────────┴──┐               │
│  │          Prisma ORM / Services           │               │
│  └──────────────────┬──────────────────────┘               │
│                     │                                       │
│  ┌──────────────────┴──────────────────────┐               │
│  │          Job Queue (Redis/BullMQ)        │               │
│  └──────────────────┬──────────────────────┘               │
└─────────────────────┼──────────────────────────────────────┘
                      │ Job dispatch
┌─────────────────────┼──────────────────────────────────────┐
│            SIM-WORKER SERVICE (Python)                      │
│  ┌──────────────────┴──────────────────────┐               │
│  │           Job Runner / Executor          │               │
│  └──────────────────┬──────────────────────┘               │
│                     │                                       │
│  ┌──────────────────┴──────────────────────┐               │
│  │         Simulation Engine Core           │               │
│  │  ┌────────┐ ┌────────┐ ┌────────┐       │               │
│  │  │Rate    │ │Spiking │ │Whole   │       │               │
│  │  │Backend │ │Backend │ │Brain   │       │               │
│  │  └────────┘ └────────┘ └────────┘       │               │
│  └─────────────────────────────────────────┘               │
└────────────────────────────────────────────────────────────┘
        │                │
┌───────┴───┐    ┌───────┴───────┐
│ PostgreSQL│    │ Redis         │
│ (metadata)│    │ (jobs/cache)  │
└───────────┘    └───────────────┘
        │
┌───────┴───────┐
│ Object Storage│
│ (artifacts)   │
└───────────────┘
```

## 2. Component Responsibilities

### 2.1 Frontend (apps/web)
- Single-page application built with React + Vite
- State management: TanStack Query for server state, Zustand for UI state
- WebSocket client for live telemetry streaming
- Three.js for 3D brain visualisation
- D3/Recharts for time-series and metrics charts
- All data fetched from API; no direct DB access

### 2.2 API Service (apps/api)
- NestJS application with modular architecture
- REST endpoints for CRUD operations on models, datasets, experiments, runs
- WebSocket gateway for bidirectional telemetry streaming
- Prisma ORM for PostgreSQL access
- BullMQ for job queue management
- Validates all inputs with Zod schemas (shared with frontend via contracts package)
- Does NOT run simulations; dispatches to sim-worker

### 2.3 Simulation Worker (apps/sim-worker + python/engine)
- Python process that picks jobs from Redis queue
- Loads model configs, initialises simulation backend
- Runs simulation loop: step → observe → emit metrics → checkpoint
- Publishes telemetry events to Redis pub/sub
- Writes artifacts to object storage layout
- Stateless per-job; all state in checkpoints

### 2.4 Simulation Engine (python/engine)
- Pure Python library, no framework dependencies
- Abstract SimulationBackend interface
- Concrete adapters: RateBasedBackend, SpikingBackend, WholeBrainBackend
- Model loading and validation
- Stimulus injection system
- Observable extraction
- Checkpoint serialization
- Fully unit-testable without infrastructure

## 3. Data Architecture

### 3.1 PostgreSQL (Operational Metadata)
Stores: Users, BrainModels, Regions, ConnectivitySets, Datasets,
Experiments, ExperimentRuns, RunEvents, RunMetrics, SimulationPresets

### 3.2 Redis
- BullMQ job queue for simulation dispatch
- Pub/Sub channels for live telemetry relay
- Short-term caching of run status

### 3.3 Object Storage Layout (Local FS for v0.1)
```
/storage
  /datasets/{dataset_id}/
    connectivity.npz
    regions.json
    metadata.json
  /runs/{run_id}/
    config.json
    traces/
      activity_{step}.npz
    checkpoints/
      checkpoint_{step}.pkl
    metrics.json
    summary.json
```

## 4. Communication Patterns

### 4.1 Simulation Job Flow
1. Frontend → API: POST /experiments/{id}/runs (start run)
2. API: Creates ExperimentRun record, enqueues BullMQ job
3. Sim-worker: Dequeues job, loads model + config
4. Sim-worker: Runs simulation loop, publishes metrics to Redis pub/sub
5. API WebSocket gateway: Subscribes to Redis channel, forwards to client
6. Sim-worker: On completion, writes artifacts, updates run status via API
7. Frontend: Receives run_completed event, fetches final results

### 4.2 WebSocket Events
| Event | Direction | Payload |
|---|---|---|
| run_started | Server→Client | {runId, config} |
| run_progress | Server→Client | {runId, step, totalSteps, elapsed} |
| run_metric | Server→Client | {runId, step, metrics: Record<string,number>} |
| run_checkpoint | Server→Client | {runId, step, checkpointId} |
| run_warning | Server→Client | {runId, message, details} |
| run_error | Server→Client | {runId, error, fatal} |
| run_completed | Server→Client | {runId, summary} |
| run_command | Client→Server | {runId, command: pause|resume|stop} |

## 5. Simulation Backend Interface

```python
class SimulationBackend(ABC):
    @abstractmethod
    def init(self, model: BrainModel, config: SimConfig) -> None: ...
    @abstractmethod
    def reset(self, seed: int) -> None: ...
    @abstractmethod
    def step(self, dt: float) -> None: ...
    @abstractmethod
    def observe(self) -> Dict[str, np.ndarray]: ...
    @abstractmethod
    def apply_stimulus(self, stimulus: Stimulus) -> None: ...
    @abstractmethod
    def save_checkpoint(self) -> bytes: ...
    @abstractmethod
    def load_checkpoint(self, data: bytes) -> None: ...
    @abstractmethod
    def shutdown(self) -> None: ...
```

## 6. Security Model (v0.1)

- Local development only; no auth enforcement
- API accepts X-Dev-User header for user identification
- No secrets in client bundles
- Environment variables for all configuration
- Docker network isolation between services

## 7. Scaling Strategy (Future)

- Sim-worker is horizontally scalable (stateless, job-based)
- API is stateless behind load balancer
- PostgreSQL: read replicas for analytics queries
- Redis: cluster mode for high-throughput telemetry
- Object storage: swap local FS for S3-compatible store
- Large simulations: partition model across workers (future MPI/Ray integration)

## 8. Technology Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Frontend framework | React + Vite | Fast dev, ecosystem, team familiarity |
| UI components | shadcn/ui + Tailwind | Composable, dark theme, data-dense layouts |
| API framework | NestJS | Module system, DI, WebSocket support, TypeScript |
| ORM | Prisma | Type safety, migrations, introspection |
| Job queue | BullMQ | Redis-based, reliable, dashboard available |
| Simulation language | Python | NumPy/SciPy ecosystem, researcher familiarity |
| 3D rendering | Three.js | Mature, performant, React integration (R3F) |
| Charting | Recharts + D3 | Declarative React charts + custom viz |
| Shared schemas | Zod | Runtime validation + TypeScript inference |
