# 🧠 BrainForge Model Library

Details, datasets, and experiment guides for every brain model in BrainForge.

---

## Quick Answer: Datasets vs. Connectivity

**Each model ships with structural connectivity data** — the white-matter wiring diagram of the brain:

| What | Stored as | Where to see it |
|---|---|---|
| **Regions** | 3D MNI coordinates + anatomy | Visual Explorer → hover nodes |
| **Connections** | Weighted edges between region pairs | Visual Explorer → blue/purple lines |
| **Connectivity Set** | The full NxN weight matrix | `GET /api/models/:id/connectivity` |

**"Datasets" in BrainForge** are a separate concept — they're arbitrary uploaded files (e.g., resting-state fMRI BOLD timeseries, EEG recordings) you'd want to compare against simulation output. The built-in models don't come with empirical datasets, but you can upload your own via `POST /api/datasets`. Real datasets for each model are freely available from the sources listed in each section below.

---

## Model 1: DK68 — Desikan-Killiany Atlas

| Property | Value |
|---|---|
| **Regions** | 68 (34 per hemisphere) |
| **Connections** | ~900 (synthetic, distance-based) |
| **Coverage** | Cortical surface only |
| **Space** | MNI152 |
| **Real data source** | [USC Multimodal Connectivity Database](http://umcd.humanconnectomeproject.org) |

### What is it?
The DK68 is the most widely used parcellation in whole-brain computational modelling. It divides the cortical surface into 68 anatomically defined gyral regions (sulci and gyri you can name: fusiform, precentral, insula…). TheVirtualBrain uses it as its default atlas. Most published whole-brain models use DK68.

### Best for
- Entry-level experiments, learning the interface
- Comparing against published TVB results
- Clinical translation (stroke, AD, epilepsy)

### Real empirical datasets you can download
| Dataset | What | Link |
|---|---|---|
| HCP resting-state | 1200-subject fMRI BOLD | [humanconnectome.org](https://www.humanconnectome.org/study/hcp-young-adult) |
| ADNI | Alzheimer's fMRI + DTI | [adni.loni.usc.edu](https://adni.loni.usc.edu) |
| OpenNeuro ds000030 | Resting-state fMRI (68 subjects) | [openneuro.org/datasets/ds000030](https://openneuro.org/datasets/ds000030) |

### 🧪 Experiments specific to DK68
1. **Default mode network isolation** — compare mean activity of left/right angular, precuneus, and medial prefrontal vs. rest of cortex. At coupling ~0.5, DMN regions should show correlated fluctuations.
2. **The canonical phase transition** — Experiment 1 from [EXPERIMENTS.md](EXPERIMENTS.md), coupling 0.1→1.2. Reproduces Deco et al. (2013) Figure 3.
3. **Virtual TMS** — increase `gain` in frontal regions only (simulate transcranial magnetic stimulation). Not yet a UI feature but doable by modifying region metadata.

---

## Model 2: AAL-90 — Automated Anatomical Labeling

| Property | Value |
|---|---|
| **Regions** | 90 (45 per hemisphere) |
| **Connections** | ~6,600 (distance-dependent) |
| **Coverage** | Cortex + subcortex (caudate, putamen, thalamus, amygdala, hippocampus, cerebellum) |
| **Space** | MNI152 |
| **Original paper** | Tzourio-Mazoyer et al., *NeuroImage* 2002 |
| **Real data source** | [ABIDE](http://fcon_1000.projects.nitrc.org/indi/abide/) · [ADHD-200](http://fcon_1000.projects.nitrc.org/indi/adhd200/) |

### What is it?
AAL-90 adds **22 subcortical regions** beyond what DK68 covers — crucially the basal ganglia (caudate, putamen, pallidum), thalamus, amygdala, hippocampus, and cerebellar lobules. This makes it far better for studying:
- **Memory circuits** (hippocampus ↔ prefrontal)
- **Motor loops** (basal ganglia ↔ motor cortex ↔ thalamus)
- **Emotional processing** (amygdala ↔ orbitofrontal)

It's the standard atlas for autism (ABIDE), ADHD, and Parkinson's research.

### Real empirical datasets
| Dataset | What | Link |
|---|---|---|
| ABIDE I+II | Autism fMRI (1000+ subjects) | [fcon_1000.projects.nitrc.org/indi/abide](http://fcon_1000.projects.nitrc.org/indi/abide/) |
| ADHD-200 | ADHD resting-state fMRI | [fcon_1000.projects.nitrc.org/indi/adhd200](http://fcon_1000.projects.nitrc.org/indi/adhd200/) |
| Parkinson's Progression | Longitudinal DTI + fMRI | [ppmi-info.org](https://www.ppmi-info.org/) |

### 🧪 Experiments specific to AAL-90

**Experiment A: Motor Loop Dynamics**

The basal ganglia → thalamus → motor cortex loop (the cortico-striatal-thalamic circuit) is the engine of voluntary movement. In Parkinson's disease this loop is disrupted.

*Setup:*
1. Create Experiment: **"Healthy Motor Loop"** — coupling 0.5, noise 0.02, duration 5s
2. Note the auto-rotate Visual Explorer showing thalamus (blue/purple node near centre) connected densely to motor cortex regions
3. Create Experiment: **"Parkinson's Motor Loop"** — same params, then in the DB:
```sql
-- Reduce striato-thalamic connectivity (simulate dopamine depletion)
UPDATE connections SET weight = weight * 0.3
WHERE source_region_id IN (
  SELECT id FROM regions WHERE name IN ('L_Caudate', 'R_Caudate', 'L_Putamen', 'R_Putamen')
)
AND target_region_id IN (
  SELECT id FROM regions WHERE name IN ('L_Thalamus', 'R_Thalamus')
);
```
4. Compare! Look for reduced motor cortex activity and increased noise in the basal ganglia regions.

**Experiment B: Limbic System — Anxiety & Fear**
1. Create Experiment: **"Limbic Baseline"** — coupling 0.5
2. Create Experiment: **"Heightened Amygdala"** — then raise amygdala gain: coupling 0.7, gain 1.5
3. Compare mean activity of temporal and prefrontal regions — high amygdala activity should propagate forward to orbitofrontal (the "anxious rumination" circuit)

**Experiment C: Autism Connectivity Pattern**
ABIDE studies show reduced long-range connectivity + increased local connectivity in autism.
1. **Baseline** — coupling 0.5
2. **Autism-like** — increase noise_sigma to 0.08 (more local variance) and reduce global_coupling to 0.3 (less long-range)
3. Compare: look for reduced correlation between hemispheres and between frontal and temporal regions

---

## Model 3: Schaefer-100 — 7-Network Parcellation

| Property | Value |
|---|---|
| **Regions** | 100 (50 per hemisphere) |
| **Connections** | ~7,050 (distance-dependent) |
| **Coverage** | Cortex only, with explicit network labels |
| **Networks** | Visual, Somatomotor, Dorsal Attention, Salience, Limbic, Frontoparietal, Default Mode |
| **Space** | MNI152 / fsaverage |
| **Original paper** | Schaefer et al., *Cerebral Cortex* 2018 |
| **Real data source** | Included in [nilearn](https://nilearn.github.io/stable/modules/generated/nilearn.datasets.fetch_atlas_schaefer_2018.html) |

### What is it?
The Schaefer parcellation is **network-first** — every region is pre-assigned to one of 7 large-scale intrinsic networks based on resting-state fMRI. This makes it perfect for:
- **Network-level analysis** — does each network maintain its coherence?
- **Between-network interactions** — how does coupling between DMN and salience networks change with parameters?
- **Replicating fMRI studies** — most modern resting-state papers use Schaefer-100 or Schaefer-200

The key advantage over DK68: **you know which network each region belongs to** from the name prefix (`L_Default_01`, `L_DorsAttn_03`, etc.)

### Real empirical datasets
| Dataset | What | Link |
|---|---|---|
| HCP S1200 | 1200 subjects, high-res fMRI | [humanconnectome.org](https://www.humanconnectome.org) |
| UK Biobank | 40,000+ subjects fMRI | [biobank.ac.uk](https://www.ukbiobank.ac.uk) |
| nilearn example data | Ready-to-use, small | `nilearn.datasets.fetch_atlas_schaefer_2018()` |

### 🧪 Experiments specific to Schaefer-100

**Experiment A: The 7 Networks — Do They Self-Organise?**

The hypothesis: at the right coupling, the 7 intrinsic networks (DMN, Salience, DAN, SMN, Visual, Limbic, FPN) should show *within-network* correlated activity and *between-network* anti-correlations — just like real fMRI.

*Setup:*
1. Create an experiment: coupling 0.5, noise 0.02, duration 10s
2. Run it
3. In Compare Runs, look at the Activity chart — do `L_Default_*` regions move together?

*What you should see:* At coupling ~0.5, the 7 network structure is approximately preserved. At coupling 1.0, all 100 regions lock together (network structure collapses).

**Experiment B: DMN vs Salience — The Seesaw**

The Default Mode Network and Salience Network are typically anti-correlated in real fMRI — when DMN is active (mind-wandering), salience is suppressed (and vice versa). This is disrupted in depression and schizophrenia.

*Setup:*
1. **Baseline**: coupling 0.5, duration 10s
2. **DMN-hyper**: Reduce Salience↔DMN connectivity: In the DB, set weight = weight * 0.1 for connections between `L_SalVentAttn_*` and `L_Default_*` regions. Now the anti-correlation should break down.
3. Compare both runs — look for reduced variance in Salience activity (it doesn't get "pushed" by DMN anymore)

**Experiment C: Task vs. Rest Simulation**

During a cognitive task, DMN *deactivates* and DAN/FPN *activates*. Simulate this by modulating gain:
1. **Rest**: all regions gain 1.0, coupling 0.5
2. **Task-like**: set DMN gain 0.5 (suppressed), DAN gain 1.5 (boosted). Approximate this by using global gain 1.0 then comparing the two runs' overall activity distribution.

---

## Model 4: Mouse Connectome — Allen Brain Atlas

| Property | Value |
|---|---|
| **Regions** | 33 (bilateral isocortex + hippocampus + thalamus + cerebellum) |
| **Connections** | ~830 (distance-dependent, mm scale) |
| **Coverage** | Isocortex, hippocampus, thalamus, cerebellum |
| **Space** | mm from bregma (ABI stereotaxic) |
| **Original atlas** | Allen Mouse Brain Connectivity Atlas (Oh et al., *Nature* 2014) |
| **Real data source** | [connectivity.brain-map.org](https://connectivity.brain-map.org) |

### What is it?
A vastly simplified version of the Allen Mouse Brain Atlas — the most detailed **mesoscale** connectome available (injection tracing, not DTI). The mouse brain is ~3,000x smaller than a human brain but shares the same fundamental circuit motifs: cortex ↔ thalamus loops, hippocampal memory circuits, cortico-cerebellar coordination.

Why does this matter?
- **Most neuroscience experiments are done in mice** — this model bridges computation to bench experiments
- The mouse brain has fewer regions → faster simulation, cleaner results
- You can compare simulation output directly against Allen Atlas experimental data (available free online)
- Optogenetics data: researchers optogenetically stimulate specific mouse brain regions — you can simulate this!

### Coordinate system note
Mouse coordinates are in **mm from bregma** (the skull landmark):
- X: lateral (positive = right)
- Y: anterior-posterior (positive = anterior)
- Z: dorsal-ventral (positive = dorsal)

Typical values: -5 to +5 mm. The Visual Explorer will show this much smaller spread than human models.

### Real empirical datasets
| Dataset | What | Link |
|---|---|---|
| Allen Connectivity Atlas | Viral tracer injection data (1000+ experiments) | [connectivity.brain-map.org](https://connectivity.brain-map.org) |
| Allen Brain Observatory | Calcium imaging + neuropixels | [observatory.brain-map.org](https://observatory.brain-map.org) |
| DANDI Archive | Publicly shared mouse electrophysiology | [dandiarchive.org](https://dandiarchive.org) |
| OpenScope | Collaborative neural data from many labs | [alleninstitute.org/what-we-do/brain-science/research/openscope](https://alleninstitute.org/what-we-do/brain-science/research/openscope/) |

### 🧪 Experiments specific to Mouse Connectome

**Experiment A: Hippocampal Memory Encoding — Theta Rhythm**

Mouse hippocampus generates theta oscillations (4–12 Hz) during exploration and memory encoding. Simulate this:

*Setup:*
1. Create: **"Rest"** — tau 0.01, coupling 0.4, noise 0.02
2. Create: **"Theta"** — tau 0.005 (faster dynamics → higher frequency), coupling 0.5, noise 0.02
3. Compare mean activity of CA1, CA3, and DG regions across both runs — in the Theta condition you should see more active hippocampal dynamics

**Experiment B: Optogenetic Stimulation of Motor Cortex**

Optogenetics is the mouse brain's greatest experimental tool — shine a light, specific neurons fire. Simulate driving MOp (primary motor cortex):

*Setup:*
1. Create: **"MOp Stimulation"** — gain 1.5, coupling 0.6 (the extra gain simulates channelrhodopsin-driven excitation of MOp)
2. Compare against baseline (gain 1.0)
3. In Compare Runs, the motor cortex (MOp, MOs), thalamus (VPM), and even cerebellum (Crus1) should show elevated activity — downstream targets of motor drive

**Experiment C: Thalamic Gating**

The thalamus is the brain's relay station — it controls what sensory signals reach cortex. Classic experiments show that stimulating thalamus can switch the brain between sleep and wake states.

*Setup:*
1. **Gated ON**: coupling 0.6, gain 1.0 — all signals flowing
2. **Thalamic suppression**: Before running, in the DB:
```sql
UPDATE connections SET weight = weight * 0.1
WHERE source_region_id IN (SELECT id FROM regions WHERE name IN ('LGd_L', 'LGd_R', 'VPM_L', 'VPM_R'))
   OR target_region_id IN (SELECT id FROM regions WHERE name IN ('LGd_L', 'LGd_R', 'VPM_L', 'VPM_R'));
```
3. Compare: sensory cortex (SSp, VIS, AUD) should show dramatically reduced activity when thalamus is cut off.

> 🔥 **Mind-blower**: This experiment replicates the mechanism of **propofol anesthesia** — propofol hyperpolarises thalamic neurons, blocking thalamocortical signal relay, which collapses cortical activity. You're simulating anesthesia in a virtual mouse brain.

---

## Comparing Across Models

| Question | Best model | Why |
|---|---|---|
| Clinical relevance (stroke, AD) | DK68 | Maps to most published patient data |
| Subcortical / basal ganglia | AAL-90 | Only one with caudate, putamen, pallidum |
| Network-level (DMN, salience) | Schaefer-100 | Regions pre-labeled by network |
| Fast sim to verify hypotheses | Mouse | Only 33 regions → 10x faster than AAL-90 |
| Optogenetics comparison | Mouse | Only atlas with matching experimental data |
| Comparing to real fMRI | Schaefer-100 | Used in most modern fMRI parcellation papers |

---

## Getting Real Connectivity Matrices

To import the *real* (not synthetic) structural connectivity for AAL-90 or Schaefer-100:

### Option 1: TheVirtualBrain
Download at [thevirtualbrain.org/tvb/zwei/client-area/standard](https://www.thevirtualbrain.org/tvb/zwei/client-area/standard):
```bash
# After downloading, import with:
python3 scripts/import_model.py \
  --format tvb \
  --input ~/Downloads/tvb_connectivity_AAL90.zip \
  --name "AAL-90 (TVB Real)"
```

### Option 2: Mouse — Allen SDK
```python
# pip install allensdk
from allensdk.core.mouse_connectivity_cache import MouseConnectivityCache
mcc = MouseConnectivityCache()
W, rsp = mcc.get_structure_connectivity_matrix()
# Export W as numpy, import with:
# python3 scripts/import_model.py --format numpy --weights W.npy --centres centres.txt --name "Allen Mouse (Real)"
```

### Option 3: Schaefer real connectivity (HCP)
Real DWI tractography for Schaefer-100 is available pre-computed:
```bash
# From GitHub: HCP group-average structural connectivity
wget https://github.com/ThomasYeoLab/CBIG/raw/master/stable_projects/brain_parcellation/Schaefer2018_LocalGlobal/Parcellations/HCP/fslr32k/cifti/Schaefer2018_100Parcels_7Networks_order.dlabel.nii
```
Then use the importer to bring in the weight matrix.
