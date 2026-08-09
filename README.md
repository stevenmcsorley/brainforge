# 🧠 BrainForge — Neural Simulation Platform

A research-grade platform for whole-brain neural dynamics simulation. Define anatomical connectivity models, run rate-based or spiking simulations, monitor activity in real-time, and compare results across parameter sweeps.

---

## Quick Start

### Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 20+ |
| Python | 3.12+ |
| Docker | 24+ |
| npm | 10+ |

### One-command startup

```bash
cd brainforge
bash start-dev.sh
```

Then open **http://localhost:5173**

> First time only: run the setup steps below before `start-dev.sh`

---

## First-Time Setup

```bash
# 1. Install all dependencies
npm install

# 2. Start Postgres + Redis
docker compose up postgres redis -d

# 3. Set up the database
cd apps/api
npx prisma migrate dev --name init
npx prisma db seed        # loads the DK68 model + sample experiment

# 4. Build the API
npx tsc

# 5. Build shared packages
cd ../..
npx tsc -p packages/contracts/tsconfig.json
npx tsc -p packages/config/tsconfig.json
npx tsc -p packages/types/tsconfig.json

# 6. Start everything
bash start-dev.sh
```

---

## Architecture

```
┌─────────────────┐   HTTP/WS    ┌─────────────────┐
│  Vite Frontend  │ ──────────── │  NestJS API      │
│  React + R3F    │   :5173      │  :3001           │
└─────────────────┘              └────────┬────────┘
                                          │ Prisma
                                 ┌────────▼────────┐
                                 │   PostgreSQL     │
                                 │   :5432          │
                                 └─────────────────┘
                                          │ BullMQ
                                 ┌────────▼────────┐
                                 │     Redis        │
                                 │     :6379        │
                                 └────────┬────────┘
                                          │
                                 ┌────────▼────────┐
                                 │  Python Worker   │
                                 │  (sim engine)    │
                                 └─────────────────┘
```

| Service | Port | Description |
|---|---|---|
| Frontend (Vite) | 5173 | React UI with Three.js 3D viewer |
| API (NestJS) | 3001 | REST + WebSocket, Prisma ORM |
| PostgreSQL | 5432 | Models, experiments, run metrics |
| Redis | 6379 | BullMQ job queue + telemetry pub/sub |
| Sim-worker (Python) | — | Executes simulation jobs, streams events |

---

## Features

### Brain Models
- Browse the included **DK68** model (68 cortical regions, 1372 connections)
- View 3D connectome in **Visual Explorer**: glowing nodes + weighted connectivity edges
- Toggle hemispheres, adjust edge weight threshold, hover to inspect regions

### Experiments
- Create experiments by picking a model and configuring:
  - **Backend**: `rate_based` or `spiking`
  - **Duration** and time-step (`dt`)
  - **Backend parameters**: global coupling, gain, noise sigma
  - **Tags** for organisation
- Experiments track all their runs and display aggregate status

### Simulation Runs
- Click **Start Run** to dispatch a job to the Python sim-worker
- The worker runs the simulation, streaming metrics via Redis pub/sub
- Each run stores timestep metrics in PostgreSQL for later analysis

### Live Monitor
- Real-time **progress bar** and elapsed time
- **Mean / Max / Std activity** stats updated every 10 steps
- **Activity-over-time chart** (Recharts)
- **Region Activity Snapshot**: 68-region heatmap strip

### Interactive Brain-Pong (closed sensorimotor loop)

A live 2D Pong match wired into a running simulation:

- The ball's Y-position is injected at 10 Hz as external current into a **sensory
  region** — `lh_lingual` (visual cortex, atlas index 11) by default on DK68.
- The right paddle position is driven by the live activity of a **motor region** —
  `lh_precentral` (M1, index 22).
- Paddle hits emit a `reward` command (+5.0), misses emit −2.0. With
  `plasticity_enabled` set, this modulates an Oja's-rule update applied only to
  existing anatomical connections.

Set `sensoryNodes` / `motorNodes` in the experiment's `environment` config to use
different regions. The defaults are DK68 atlas indices and are meaningless for
other parcellations.

> **Status: the loop runs, but it does not currently learn the task.**
>
> Measured over a 600 s run (DK68, `learning_rate` 0.05, seed 42): rally rate was
> 16.7% (5 hits / 25 misses) and *declined* across the session — the last two
> 15 s epochs scored zero, and mean tracking error rose from 37 to 43.
>
> The reward accumulator is additive and decays with a 1 s time constant, so a
> +5.0 burst scales the weight update ~500× over the 0.01 baseline. Mean weight
> grew from 0.0064 to 0.721 (+11,000%) and then flattened, with edges pinned at
> the `clip(0, 5.0)` ceiling; mean activity saturated near 0.97 and the motor
> region sat at 0.9995 against the `[0, 1]` clamp. A saturated region cannot
> encode ball position, so tracking degrades as the weights grow.
>
> There is also a second, deeper problem: **the sensory→motor pathway barely
> carries signal at all.** Driving the sensory region with a 2.0-amplitude square
> wave moves the motor region by ~3e-4 in activity. That figure is essentially
> the same for every visual→motor region pairing in DK68 — it is set by
> mean-field normalisation (`w/N * coupling` ≈ 0.005 for N=68), which leaves the
> network far below the sigmoid threshold, not by which regions you pick.
> Earlier defaults (indices 1 and 30) were mislabelled as visual/motor cortex;
> those are now corrected to real visual and motor regions, but that is a
> labelling fix and does **not** improve transmission.
>
> Treat this as a demonstration of the closed-loop plumbing — stimulus in,
> activity out, plasticity modulated by reward — not as a working learning
> result. Making it converge needs the network gain (coupling / normalisation /
> sigmoid threshold), the reward scaling, and the Oja decay term (`alpha = N`)
> revisited together; all are open questions, not settled defaults.

### Compare Runs
- Tick any completed runs (up to 5) from the run browser
- Overlay **Mean Activity** traces on a shared chart
- **Parameter diff table**: highlighted rows show where configs differ
- **Run summary cards** with colour-coded identity

### Admin / Diagnostics
- `/api/admin/health` — Postgres + Redis health check
- `/api/admin/stats` — total counts of models, datasets, experiments, runs

---

## Importing Other Brain Models

The API accepts any connectivity model via JSON. You can import from:

### Supported sources

| Source | Format | Notes |
|---|---|---|
| **TheVirtualBrain (TVB)** | `.zip` (numpy arrays) | World's largest open-source brain simulator; 80+ parcellations |
| **Human Connectome Project** | CSV tract weights | 360-region MMP atlas (Glasser 2016) |
| **AAL / Schaefer / Gordon** | CSV or numpy | Common for fMRI parcellations |
| **Custom DTI tractography** | Any matrix format | Export to the JSON format below |
| **Allen Brain Atlas** | Gene expression + connectivity | Mouse brain models |

### Import via API

**Step 1 — Create the brain model record:**
```bash
curl -X POST http://localhost:3001/api/models \
  -H "Content-Type: application/json" \
  -H "X-Dev-User: dev@brainforge.local" \
  -d '{
    "name": "Schaefer 100-region Parcellation",
    "description": "100-region cortical parcellation from Schaefer 2018",
    "defaultBackend": "rate_based",
    "parameters": {
      "tau": 0.01,
      "gain": 1.0,
      "noise_sigma": 0.02,
      "global_coupling": 0.5
    }
  }'
```
Save the returned `id` as `MODEL_ID`.

**Step 2 — Use the seed script as a template:**

The fastest way to import a custom model is to write a seed-style script. See `apps/api/prisma/seed.ts` for the exact format — it shows how to create regions with `coordX/Y/Z` and connections with `weight + delay`.

```typescript
// Example: import a custom 100-region model
const regions = await Promise.all(
  myRegions.map(r => prisma.region.create({
    data: {
      name: r.name,
      abbreviation: r.abbr,
      hemisphere: r.hemi,   // 'left' | 'right' | 'midline'
      coordX: r.mni_x,
      coordY: r.mni_y,
      coordZ: r.mni_z,
      atlasIndex: r.idx,
      connectivitySetId: connectivitySet.id,
    }
  }))
);
// Then create connections from your NxN weight matrix
```

### Python import helper (coming soon)
A `scripts/import_model.py` helper is planned that accepts:
- TVB `.zip` files directly
- NumPy `.npy` weight + distance matrices
- CSV edge lists

---

## Simulation Backends

| Backend | Description | Best for |
|---|---|---|
| `rate_based` | Wilson-Cowan rate equations, continuous neural mass activity | Fast exploration, parameter sweeps, fMRI BOLD studies |
| `spiking` | Leaky integrate-and-fire (LIF) neuron populations | EEG/spike train analysis, more biologically detailed |
| `whole_brain` | *(planned)* Kuramoto oscillators, Balloon-Windkessel BOLD model | BOLD signal prediction, resting-state networks |

---

## What You Can Study

- **Resting-state dynamics** — how does structural connectivity shape spontaneous activity?
- **Global coupling effects** — run sweeps of `global_coupling` from 0.1 → 2.0, compare synchrony
- **Noise sensitivity** — vary `noise_sigma`, observe phase transitions
- **Lesion studies** — remove connections to specific regions, observe downstream effects (manually edit the connectivity set in the DB)
- **Parameter landscapes** — create many experiments with systematic parameter variation, use Compare Runs to overlay them
- **Inter-hemispheric dynamics** — use the Visual Explorer hemisphere toggle to study lateralisation

---

## What's Next / Roadmap

- [ ] **Python model importer script** — accept TVB zips, CSV matrices directly
- [ ] **Parameter sweep tool** — automatically create N experiments varying one parameter
- [ ] **BOLD signal conversion** — Balloon-Windkessel model to convert activity → synthetic fMRI
- [ ] **EEG forward model** — project regional activity to scalp electrodes
- [ ] **Animated connectome** — colour nodes in Visual Explorer by live activity during a run
- [ ] **Longer simulation support** — chunked storage for runs > 30s
- [ ] **Export results** — download run metrics as CSV / NumPy

---

## Service Logs

```bash
tail -f /tmp/brainforge-api.log      # NestJS API
tail -f /tmp/brainforge-worker.log   # Python sim-worker
tail -f /tmp/brainforge-vite.log     # Vite frontend
```

## Stopping Everything

```bash
pkill -f "node dist/main"
pkill -f "sim_worker.main"
pkill -f "vite --host"
docker compose stop
```
