# 🧪 BrainForge Experiment Cookbook

> A guide to running compelling neural dynamics experiments — from basic parameter sweeps to simulating neurological conditions. Each experiment includes the hypothesis, how to set it up, what to look for, and the real neuroscience behind it.

---

## 🧭 How to Run Any Experiment

1. Go to **Experiments → New Experiment**
2. Select the **DK68 model**
3. Set the parameters described below
4. Hit **Start Run**
5. Watch the **Live Monitor** — then use **Compare Runs** to overlay results

---

## ⚡ Experiment 1: The Phase Transition (Most Important!)

**Hypothesis:** As global coupling increases, the brain transitions from incoherent noise → synchronized oscillation → epileptic saturation. There is a critical point where rich spontaneous dynamics emerge.

**The science:** This is a fundamental finding in computational neuroscience. The brain operates near a *critical point* — a phase transition like water turning to ice. Too little coupling: regions are independent and noisy. Too much: they all lock together in one big oscillation (like a seizure). The most interesting dynamics — and the best match to real fMRI data — happens right at the edge.

### Setup: Create 5 experiments

| Experiment Name | `global_coupling` | Other settings |
|---|---|---|
| `coupling_0.1` | **0.1** | duration=5s, noise_sigma=0.02 |
| `coupling_0.3` | **0.3** | duration=5s, noise_sigma=0.02 |
| `coupling_0.5` | **0.5** | duration=5s, noise_sigma=0.02 |
| `coupling_0.8` | **0.8** | duration=5s, noise_sigma=0.02 |
| `coupling_1.2` | **1.2** | duration=5s, noise_sigma=0.02 |

### What to look for in Compare Runs
- **Coupling 0.1**: Flat, noisy activity. Regions barely talk to each other. Mean activity ~0.5 with high variance.
- **Coupling 0.3**: Slight structure emerges. Some correlated fluctuations.
- **Coupling 0.5**: *(Default)* Moderate synchrony. This is roughly where the model matches resting-state fMRI.
- **Coupling 0.8**: Strong synchrony. Max activity climbs. You'll see the trace start to pulse.
- **Coupling 1.2**: Full synchronization. All 68 regions fire together. Max activity near 1.0. This resembles a seizure state.

> 🔥 **Mind-blower:** You are simulating a phase transition — the same mathematical phenomenon as a ferromagnet losing its magnetization at the Curie temperature. The brain may use proximity to this critical point to maximise information processing.

---

## 🎲 Experiment 2: Stochastic Resonance — Noise Is Useful

**Hypothesis:** A small amount of noise *improves* signal propagation in neural systems. Too little noise → signals die. Right amount → signals ride the noise to cross firing thresholds. Too much → chaos.

**The science:** Stochastic resonance is a real phenomenon observed in neurons, sensory systems (even crayfish hair cells), and whole-brain models. Noise paradoxically enhances the detection of weak signals.

### Setup: Create 4 experiments (fix coupling at 0.4)

| Name | `noise_sigma` | `global_coupling` |
|---|---|---|
| `noise_0` | **0.0** | 0.4 |
| `noise_0.01` | **0.01** | 0.4 |
| `noise_0.05` | **0.05** | 0.4 |
| `noise_0.20` | **0.20** | 0.4 |

### What to look for
- **Zero noise**: Completely flat activity. Regions reach equilibrium and freeze.
- **Low noise (0.01)**: Activity starts to fluctuate slightly. Heterogeneous patterns emerge.
- **Moderate noise (0.05)**: Richest dynamics. Regional differences are most prominent.
- **High noise (0.20)**: Chaotic, all regions look the same — the noise drowns out structure.

> 🔥 **Mind-blower:** Your brain's thermal noise at body temperature (37°C) is not a bug — it's a feature. The noise floor in neurons may be precisely tuned for stochastic resonance.

---

## 🧠 Experiment 3: Virtual Stroke — Disconnecting a Hub Region

**Hypothesis:** Disconnecting a highly connected "hub" region (like the precuneus or posterior cingulate cortex) causes a disproportionate collapse in whole-brain network activity.

**The science:** The brain has "rich-club" hubs — regions with far more connections than average (like airport hub cities). In stroke, Alzheimer's, and schizophrenia, these hubs are preferentially damaged. Virtual lesioning lets you predict the downstream functional effects.

### Setup

**Step 1:** Find a hub region's ID via the API:
```bash
curl http://localhost:3001/api/models/[MODEL_ID]/regions | python3 -m json.tool | grep -i "precuneus\|cingulate\|temporal"
```

**Step 2:** In the database, zero out all connections *from* that region:
```bash
docker exec brainforge-postgres-1 psql -U brainforge -d brainforge -c "
UPDATE connections SET weight = 0
WHERE source_region_id = '[REGION_ID]'
   OR target_region_id = '[REGION_ID]';"
```

**Step 3:** Create and run a new experiment (same params as your baseline).

**Step 4:** Compare vs. baseline in Compare Runs.

### What to look for
- Mean activity will drop
- Std activity (regional variance) will drop — regions become more uniform
- The Activity heatmap will show a "hole" where the disconnected region is

> 🔥 **Mind-blower:** This is literally how computational neuroscientists predict what happens to a patient after a stroke before the stroke occurs. Models like this are used in virtual brain surgery planning.

---

## 🌊 Experiment 4: Slow vs. Fast Neural Time Constants (τ)

**Hypothesis:** The neural time constant τ controls how fast regions integrate input. Slow time constants (large τ) produce slow rhythms like alpha waves (8–12 Hz); fast time constants produce gamma (40–80 Hz).

**The science:** Different brain regions have different time constants. Frontal cortex is slow and integrative (δ/θ rhythms, 1–8 Hz). Sensory cortex is fast and reactive (γ rhythms, 30–80 Hz). The τ parameter directly controls this.

### Setup: 3 experiments

| Name | `tau` | Expected rhythm |
|---|---|---|
| `slow_tau` | **0.05** | Slow, delta-like waves |
| `default_tau` | **0.01** | Moderate |
| `fast_tau` | **0.004** | Fast, gamma-like |

### What to look for in Live Monitor
- **Slow τ**: The activity trace shows long, rolling waves. The Activity-over-time chart has wide peaks.
- **Fast τ**: Rapid oscillations — the chart shows dense, tight ripples.

> 🔥 **Mind-blower:** Anesthesia reduces τ, slowing the brain. This is why you "go under" — the fast dynamics that support consciousness are shut down and replaced by slow wave activity. You can literally simulate anesthesia by increasing τ.

---

## 💊 Experiment 5: Simulating Alzheimer's Disease

**Hypothesis:** Alzheimer's preferentially degrades the default mode network (DMN) — especially the precuneus, posterior cingulate, and hippocampus. Simulating this connectivity loss reproduces functional patterns seen in Alzheimer's patients.

**The science:** Computational models of neurodegeneration are a real research area. Groups at UCSF, UCL, and King's College use exactly this approach to predict disease progression and test virtual drug interventions.

### Setup

**Step 1:** Identify DMN regions (posterior cingulate, precuneus, medial prefrontal, angular gyrus) and reduce their connection weights by 60%:
```bash
docker exec brainforge-postgres-1 psql -U brainforge -d brainforge -c "
UPDATE connections SET weight = weight * 0.4
WHERE source_region_id IN (
  SELECT id FROM regions WHERE name ILIKE '%cingulate%' OR name ILIKE '%precuneus%'
);"
```

**Step 2:** Run a simulation with the same parameters as your healthy baseline.

**Step 3:** Compare with baseline.

### What to look for
- **Reduced mean activity** in DMN regions
- **Increased variance** — regions become decorrelated (this matches fMRI of AD patients)
- In the Visual Explorer, the "gaps" in the connectome where weights were reduced will be visible as thinner/missing edges

> 🔥 **Mind-blower:** In 2023, researchers used computational brain models to predict tau protein deposition patterns in Alzheimer's disease — essentially forecasting where plaques would spread next in a patient's brain scan.

---

## 🔄 Experiment 6: Bilateral Synchrony — Left vs. Right Brain

**Hypothesis:** Interhemispheric connections (the corpus callosum) are crucial for maintaining symmetric activity between left and right hemispheres. Weakening them reveals asymmetric spontaneous dynamics.

**The science:** The corpus callosum connects homologous regions across hemispheres. It's reduced in schizophrenia and epilepsy. Split-brain patients (severed corpus callosum) literally have two independent minds.

### Setup

**Part A — Baseline** (use default settings, coupling 0.5)

**Part B — Severed corpus callosum:**
```bash
# Zero out all connections that cross hemispheres
# First, find left-hemisphere region IDs:
docker exec brainforge-postgres-1 psql -U brainforge -d brainforge -c "
UPDATE connections SET weight = 0
WHERE source_region_id IN (SELECT id FROM regions WHERE hemisphere = 'left')
  AND target_region_id IN (SELECT id FROM regions WHERE hemisphere = 'right');"
```

Then run a simulation and compare.

### What to look for
- Part A: Fairly symmetric activity between left and right
- Part B: In the Visual Explorer with hemisphere toggle, left and right hemispheres show divergent activity patterns
- In Compare Runs: mean activity similar but std activity diverges (left and right brain "do their own thing")

> 🔥 **Mind-blower:** Callosotomy (severing the corpus callosum) was used to treat severe epilepsy until the 1980s. The result: patients with literally two conscious streams. Roger Sperry won the 1981 Nobel Prize for discovering this.

---

## 📈 Experiment 7: Gain Modulation — Simulating Attention & Arousal

**Hypothesis:** The `gain` parameter represents the slope of the neural activation function. High gain = neurons respond sharply to inputs (like alert attention). Low gain = neurons are sluggish (drowsy, sedated).

**The science:** Acetylcholine — the neuromodulator released during attention and wakefulness — primarily acts by increasing neural gain. Norepinephrine (released during stress/alertness) also increases gain. This is the computational mechanism of attention.

### Setup: 4 experiments (coupling=0.5, noise=0.02)

| Name | `gain` | Analogous state |
|---|---|---|
| `gain_0.3` | **0.3** | Deep sleep / anesthesia |
| `gain_0.7` | **0.7** | Drowsy |
| `gain_1.0` | **1.0** | Resting wakefulness |
| `gain_2.0` | **2.0** | Highly aroused / stimulant effect |

### What to look for
- Low gain: Sluggish, low-amplitude activity. Long time to reach steady state.
- High gain: Sharp, fast activity. At gain 2.0 regions may saturate (hit max activity).
- At very high gain you may see spontaneous oscillations emerge even without noise.

> 🔥 **Mind-blower:** Caffeine works partly by increasing acetylcholine availability → increasing neural gain → sharper responses → you feel more alert. You can simulate caffeine by raising `gain` from 1.0 to 1.5.

---

## 🌀 Experiment 8: Seed-Driven Reproducibility

**Hypothesis:** The simulation is deterministic given the same seed. Two runs with seed=42 should produce *identical* traces. Different seeds produce different noise trajectories but the same statistical properties.

### Setup

Create 4 runs from the same experiment:
- Run 1: seed=42
- Run 2: seed=42  ← identical to Run 1
- Run 3: seed=100 ← different noise trajectory
- Run 4: seed=999 ← different noise trajectory

Compare all four.

### What to look for
- Runs with seed=42 should overlay **exactly** (same trace)
- Runs with different seeds: different wiggles, but same mean/std/max statistics
- This proves the simulation is numerically reproducible

> 🔥 **Mind-blower:** Reproducibility is a crisis in neuroscience. Computational models are one of the few areas where you can guarantee exact reproducibility. The same seed, the same physics, the same result — every time.

---

## 🎯 Experiment 9: The Critical Brain Hypothesis

**Hypothesis:** The brain maximises dynamic range, information transmission, and computational power at the critical point of a phase transition. This predicts that real brains self-organise to operate exactly at criticality.

### Setup
Run a full coupling sweep (Experiment 1 above with more values):

| Coupling | 0.05 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 1.0 | 1.5 |
|---|---|---|---|---|---|---|---|---|---|---|---|

Then in Compare Runs, look at the **Std Activity** (standard deviation) across all runs.

### What to look for
- Std activity forms an **inverted U-shape** — it peaks at the critical coupling value (around 0.5–0.6 for this model)
- This peak in variance is the hallmark of criticality
- The coupling value where variance is highest = the model's critical point

> 🔥 **Mind-blower:** Physicists call this *diverging susceptibility* at a critical point. If the brain is critical, it means a single neuron's firing can, in principle, propagate to the entire brain — the brain is maximally sensitive to inputs. This is why micro-stimulation during surgery (touching one neuron) can cause vivid hallucinations.

---

## 🕹️ Experiment 10: The Long Run — Emergence Takes Time

**Hypothesis:** Very short simulations (0.5s) don't give the network enough time to settle into its natural dynamics. Longer runs (10–30s) reveal emergent patterns like slow oscillations and metastable states.

### Setup

| Name | Duration | dt | Steps |
|---|---|---|---|
| `short_0.5s` | 0.5 | 0.001 | 500 |
| `medium_2s` | 2.0 | 0.001 | 2000 |
| `long_10s` | 10.0 | 0.001 | 10,000 |

### What to look for
- In the short run: you mostly see transients (the system is still settling)
- In the medium run: quasi-stationary dynamics
- In the long run: the Activity-over-time chart may show *metastability* — periods where the system briefly "visits" different activity states before switching. This is thought to be the computational basis of thought and memory.

> 🔥 **Mind-blower:** Resting-state fMRI scans typically last 5–10 minutes. The brain's intrinsic networks (default mode, salience, frontoparietal) only become visible in the correlations when you have enough time to average over many state transitions. Short scans miss them — exactly like your short simulations.

---

## 📐 Experiment 11: dt Sensitivity — Numerical Precision

**Hypothesis:** The time step `dt` controls numerical accuracy. Too large a dt causes integration errors (energy grows without bound); too small wastes compute.

### Setup

| Name | dt | Duration | Steps |
|---|---|---|---|
| `coarse_dt` | 0.005 | 2s | 400 |
| `standard_dt` | 0.001 | 2s | 2000 |
| `fine_dt` | 0.0005 | 2s | 4000 |

Compare at high coupling (0.8) where errors are most visible.

### What to look for
- Coarse dt: Activity may drift slightly upward (energy accumulation from integration error)
- Standard dt: Stable
- Fine dt: Identical to standard dt for this model (confirms convergence)

> 🔥 **Mind-blower:** This is why neuroscientists use adaptive step-size solvers (Runge-Kutta 4/5) for production simulations. TheVirtualBrain uses exactly this. BrainForge uses Euler — simple but requires small dt.

---

## 🔬 Quick Reference: Parameter Effects

| Parameter | Low value | High value | Real-world analogy |
|---|---|---|---|
| `global_coupling` | Independent regions | Full synchrony (seizure) | Turn up social connectivity in a city |
| `noise_sigma` | Silent, frozen | Chaotic | Thermal noise / diffusion |
| `gain` | Drowsy, sluggish | Sharp, saturating | Caffeine / acetylcholine |
| `tau` | Fast gamma rhythms | Slow delta waves | Wake → sleep |
| `dt` | More accurate | Less accurate (drift) | Simulation precision |
| `duration` | Transients only | Full emergent dynamics | Length of your experiment |
| `seed` | — | — | Reproducibility key |

---

## 📊 What to measure in Compare Runs

| Metric | What it tells you |
|---|---|
| **Mean activity** | Overall level of excitation in the network |
| **Max activity** | Whether any region is saturating (approaching its maximum) |
| **Std activity peak** | Where criticality occurs — highest at the phase transition |
| **Shape of trace** | Flat = frozen, noisy = subcritical, oscillating = supercritical |
| **Convergence time** | How long before the network reaches a steady state |

---

## 🌍 Real Papers This Replicates

These experiments echo published computational neuroscience research:

1. **Deco et al. (2013)** "Resting-state Human Brain Networks from MEG..." — global coupling sweep, criticality analysis
2. **Honey et al. (2009)** "Predicting human resting-state functional connectivity from structural connectivity" — structural→functional mapping
3. **Ghosh et al. (2008)** "Noise during rest enables the exploration of the brain's dynamic repertoire" — noise + criticality
4. **Breakspear (2017)** "Dynamic models of large-scale brain activity" — review of whole-brain modelling approaches
5. **Iturria-Medina et al. (2014)** "Epidemic spreading model" — lesion/disease propagation on structural graphs

---

## 🚀 Advanced: Chain of Experiments (Parameter Sweep via CLI)

If you want to automate many runs, use the API directly:

```bash
# Create 10 experiments varying global_coupling from 0.1 to 1.0
for i in $(seq 1 10); do
  COUPLING=$(echo "scale=1; $i/10" | bc)
  curl -s -X POST http://localhost:3001/api/experiments \
    -H "Content-Type: application/json" \
    -H "X-Dev-User: dev@brainforge.local" \
    -d "{
      \"name\": \"sweep_coupling_${COUPLING}\",
      \"modelId\": \"1f67f87b-1d2d-44ba-a2fb-a1ddc1481b8a\",
      \"status\": \"draft\",
      \"config\": {
        \"backend\": \"rate_based\",
        \"duration\": 5,
        \"dt\": 0.001,
        \"seed\": 42,
        \"parameters\": {
          \"tau\": 0.01,
          \"gain\": 1.0,
          \"noise_sigma\": 0.02,
          \"global_coupling\": $COUPLING
        }
      },
      \"tags\": [\"sweep\", \"coupling\"]
    }" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Created:', d.get('id','?'))"
done
```

Then start all the runs:
```bash
# Get all sweep experiment IDs and start them
curl -s http://localhost:3001/api/experiments?limit=50 | python3 -c "
import sys, json, subprocess
data = json.load(sys.stdin)
for exp in data['items']:
    if 'sweep' in (exp.get('tags') or []):
        r = subprocess.run([
            'curl', '-s', '-X', 'POST',
            f'http://localhost:3001/api/runs/start/{exp[\"id\"]}',
            '-H', 'Content-Type: application/json',
            '-H', 'X-Dev-User: dev@brainforge.local',
            '-d', '{\"seed\": 42}'
        ], capture_output=True, text=True)
        print(f'Started run for {exp[\"name\"]}')
"
```

Then head to **Compare Runs** and select all 10 sweeps to overlay them!
