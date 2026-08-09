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
  `plasticity_enabled` set, this modulates a weight update applied only to
  existing anatomical connections — Oja's rule under `rate_based`, or an
  eligibility-trace rule under `three_factor`.

Set `sensoryNodes` / `motorNodes` in the experiment's `environment` config to use
different regions. The defaults are DK68 atlas indices and are meaningless for
other parcellations.

> **Status: the loop trains with the `three_factor` backend; the default
> `rate_based` Oja rule does not.**
>
> With `backend: "three_factor"` and the settings in
> `python/engine/experiments/closed_loop.py`, measured on DK68 over five seeds:
> 600 s of training, then **plasticity frozen** and evaluated on an unseen ball
> sequence — rally rate **0.285 → 0.787** (+0.502, improved in 5/5 seeds).
> A stationary paddle scores 0.278 and a perfect one 1.000, so the skill is
> real and it persists with learning switched off.
>
> Against a matched plasticity-off control over seven seeds, improvement was
> +0.504 with plasticity versus +0.209 without (difference +0.295, t = 2.94).
> The control improves too, because the readout's normaliser warms up over a
> session — which is exactly why the control, not the learning curve, is the
> meaningful comparison.
>
> Three things had to be fixed together, and only one was the learning rule:
>
> - **Readout.** A single motor region's activity through an adaptive min/max
>   normaliser scored no better than a paddle that never moves. Motor activity
>   has a standard deviation around 0.008; min/max latches onto extremes and
>   amplifies noise. A running z-score over a motor population fixed it. A
>   linear decoder over unmodified activity plays a *perfect* game, which showed
>   the information was always there and the readout was throwing it away.
> - **Network gain.** At the defaults, mean-field normalisation
>   (`w/N * coupling` ≈ 0.005 at N=68) leaves per-region drive near 0.065 against
>   a sigmoid threshold of 0.5, giving end-to-end sensory→motor gain of ~3e-4.
>   `global_coupling` 2.0 lifts the network into its responsive range.
> - **Learning rule.** Oja's rule cannot assign credit — its modulator is a
>   global scalar, so every eligible synapse moves together and weights grow
>   until they clip. `three_factor` adds eligibility traces and a signed reward
>   prediction error.
>
> **What changed in the weights is not task-specific.** After training,
> mean |dW| is 0.124 with many edges at the 5.0 clip ceiling and 21% of edges
> moved by more than 1%. Sensory→motor edges strengthened at 0.94x the network
> average — slightly *less* than typical — and the largest changes are between
> temporal and occipital regions unrelated to the motor readout. So the
> behavioural gain is real and survives freezing, but the mechanism looks like a
> broad increase in network excitability that makes the motor readout more
> responsive, not a learned sensorimotor mapping. "The network was tuned into a
> regime where the readout works" is the defensible claim; "the brain learned to
> track the ball" is not.
>
> **Brain size is not a factor.** Ball position decodes at r ≈ 0.93–0.96 on the
> mouse connectome (N=33), DK68 (68), AAL-90 (90), Schaefer-100 (100) and
> Schaefer-400 (400) alike; a three-variable capacity test is likewise flat.
>
> **A harder task is not learned.** On `PredictivePongEnv` — spin removed,
> ball hidden past mid-court so the paddle must extrapolate from velocity —
> five seeds of 600 s training evaluated with plasticity frozen gave **+0.000**
> rally improvement with plasticity on, against **+0.033** with it off
> (difference −0.033, t = −1.76). Final performance ~0.10 against baselines of
> 0.078 (stationary), 0.205 (position tracking) and 0.915 (extrapolation).
>
> This is a clean negative rather than a null result: position, velocity and the
> landing point are all linearly decodable from network activity
> (r = 0.968, 0.965, 0.934), so the information is present and the task is
> solvable — the limit is the rule. One global scalar gating every eligible
> synapse can move the network's operating point, which is what produced the
> tracking gain, but cannot build a structured mapping like
> `landing = f(position, velocity)`.
>
> **The network is not the limit — the learning rule is.** Given the same
> activity and the same 69 readout weights, closed-form supervised regression
> reaches r = 0.846 and lands within the paddle 67.4% of the time, while
> REINFORCE on those same weights manages +0.028 (t = 0.76, noise). Ball
> position, velocity and landing point all decode from network activity
> (r = 0.968, 0.965, 0.934) and a fitted readout plays a perfect game. What
> fails is acquiring that readout from a scalar reward — the known
> credit-assignment gap between biologically-plausible plasticity and gradient
> methods, not something specific to this platform.
>
> The `node_perturb` backend supplies the missing per-synapse credit assignment
> and does measurably better — **+0.064** held-out rally against a **+0.033**
> control, where three-factor scored +0.000 — but this is still not a working
> result: t = 1.41 at n = 5, interception error improves less than in the
> control, and ~0.13 final performance sits below the 0.205 position-tracking
> baseline.
>
> Coupling the readout to all 68 regions was then tested directly, and does
> **not** fix it: +0.028 against a frozen-weight control, t = 0.76, one seed of
> five going backwards. The limit is REINFORCE's gradient variance. The
> estimator gets one sample of a 69-dimensional gradient per frame while reward
> depends on all 69 perturbations at once — about 540 effective samples per
> dimension over 600 s, with the ball's randomness adding more noise on top.
> More exploration or more coupling does not help; a lower-variance credit
> signal would.

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
