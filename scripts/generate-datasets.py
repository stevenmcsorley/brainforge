#!/usr/bin/env python3
"""
BrainForge — Synthetic Dataset Generator
Generates realistic resting-state fMRI BOLD timeseries for each brain model,
saves as CSV files, and registers them in the BrainForge database via Prisma seed.

Usage: python3 scripts/generate-datasets.py
Output: datasets/*.csv  +  database records via psql
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np

# ─── Config ───────────────────────────────────────────────────────────────────

DATASETS_DIR = Path(__file__).parent.parent / "datasets"
DATASETS_DIR.mkdir(exist_ok=True)

DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://brainforge:brainforge_dev@localhost:5432/brainforge",
)

# Model configs: (db_name, n_regions, tr_s, n_timepoints, n_sessions, network_structure)
MODELS = [
    {
        "name": "DK68 Sample Model",
        "regions": 68,
        "tr": 2.0,        # TR = 2s (standard fMRI)
        "n_tp": 300,      # 300 TRs = 600s = 10 min (matches HCP)
        "sessions": 2,
        "lambda_bold": 15,  # HRF decay ~15s
        "networks": {      # which regions belong to each network (approximate)
            "DMN":     list(range(0, 14)),
            "Visual":  list(range(14, 26)),
            "Motor":   list(range(26, 36)),
            "Frontal": list(range(36, 50)),
            "Temporal":list(range(50, 60)),
            "Parietal":list(range(60, 68)),
        },
    },
    {
        "name": "AAL-90",
        "regions": 90,
        "tr": 2.0,
        "n_tp": 300,
        "sessions": 2,
        "lambda_bold": 15,
        "networks": {
            "Frontal":    list(range(0, 18)),
            "Cingulate":  list(range(18, 22)),
            "Limbic":     list(range(22, 28)),
            "Occipital":  list(range(28, 38)),
            "Parietal":   list(range(38, 50)),
            "Subcortical":list(range(50, 68)),
            "Temporal":   list(range(68, 80)),
            "Cerebellar": list(range(80, 90)),
        },
    },
    {
        "name": "Schaefer-100",
        "regions": 100,
        "tr": 0.72,       # HCP TR = 720ms
        "n_tp": 1200,     # ~14 min at 0.72s
        "sessions": 4,    # HCP has 4 runs (LR/RL x REST1/REST2)
        "lambda_bold": 10,
        "networks": {
            "Visual":      list(range(0, 14)),
            "SomMot":      list(range(14, 26)),
            "DorsAttn":    list(range(26, 38)),
            "SalVentAttn": list(range(38, 50)),
            "Limbic":      list(range(50, 56)),
            "Cont":        list(range(56, 70)),
            "Default":     list(range(70, 100)),
        },
    },
    {
        "name": "Mouse Connectome (Allen)",
        "regions": 33,
        "tr": 1.0,        # mouse fMRI TR ~1s
        "n_tp": 600,      # 10 min at 1s
        "sessions": 3,
        "lambda_bold": 5, # shorter HRF in mouse
        "networks": {
            "Motor":      list(range(0, 4)),
            "Somatosens": list(range(4, 8)),
            "Visual":     list(range(8, 12)),
            "Auditory":   list(range(12, 14)),
            "Prefrontal": list(range(14, 20)),
            "Hippocampus":list(range(20, 26)),
            "Thalamus":   list(range(26, 30)),
            "Cerebellum": list(range(30, 33)),
        },
    },
]


# ─── BOLD signal simulation ───────────────────────────────────────────────────

def haemodynamic_filter(signal: np.ndarray, tr: float, tau: float = 6.0) -> np.ndarray:
    """Very simple HRF convolution (gamma function approximation)."""
    t = np.arange(0, 30, tr)
    hrf = (t / tau) ** 2 * np.exp(-t / tau)
    hrf /= hrf.sum()
    return np.convolve(signal, hrf, mode="full")[: len(signal)]


def generate_bold_session(
    n_regions: int,
    n_tp: int,
    tr: float,
    networks: dict,
    seed: int = 42,
    snr: float = 1.5,
) -> np.ndarray:
    """
    Generate one session of synthetic resting-state BOLD timeseries.
    
    Strategy:
    1. Generate K independent network "drivers" (AR(1) random walk)
    2. Mix into regional signals with network-specific loadings
    3. Convolve with HRF
    4. Add independent noise
    5. Bandpass filter to typical BOLD range (0.01–0.1 Hz)
    6. Z-score each region
    """
    rng = np.random.default_rng(seed)
    n_networks = len(networks)
    network_list = list(networks.values())
    total_tp = n_tp + 50  # extra timepoints to trim transients

    # 1. Generate network drivers — AR(1) processes
    rho = 0.85  # autocorrelation coefficient
    drivers = np.zeros((n_networks, total_tp))
    for k in range(n_networks):
        for t in range(1, total_tp):
            drivers[k, t] = rho * drivers[k, t - 1] + rng.normal(0, 1)

    # 2. Create regional timeseries as weighted mixture of network drivers
    bold_raw = np.zeros((n_regions, total_tp))
    for i, region_indices in enumerate(network_list):
        for r in region_indices:
            # Primary network loading (strong)
            loading = rng.uniform(0.6, 0.9)
            bold_raw[r] += loading * drivers[i]
            # Cross-network leakage (weak)
            for j in range(n_networks):
                if j != i:
                    bold_raw[r] += rng.uniform(0, 0.15) * drivers[j]

    # 3. HRF convolution
    bold_hrf = np.zeros_like(bold_raw)
    for r in range(n_regions):
        bold_hrf[r] = haemodynamic_filter(bold_raw[r], tr)

    # 4. Add independent noise
    noise = rng.normal(0, 1 / snr, bold_hrf.shape)
    bold_noisy = bold_hrf + noise

    # 5. Simple bandpass (apply in frequency domain)
    dt = tr
    freqs = np.fft.rfftfreq(total_tp, d=dt)
    low, high = 0.01, 0.1
    fft_data = np.fft.rfft(bold_noisy, axis=1)
    mask = (freqs >= low) & (freqs <= high)
    fft_filtered = fft_data * mask[np.newaxis, :]
    bold_filtered = np.fft.irfft(fft_filtered, n=total_tp, axis=1)

    # 6. Z-score, trim transients, return
    bold_trimmed = bold_filtered[:, 50:]
    bold_z = (bold_trimmed - bold_trimmed.mean(axis=1, keepdims=True)) / (
        bold_trimmed.std(axis=1, keepdims=True) + 1e-8
    )
    return bold_z  # shape: (n_regions, n_tp)


# ─── Functional connectivity matrix ──────────────────────────────────────────

def functional_connectivity(bold: np.ndarray) -> np.ndarray:
    """Pearson correlation matrix across regions."""
    return np.corrcoef(bold)


# ─── CSV export ───────────────────────────────────────────────────────────────

def save_bold_csv(bold: np.ndarray, path: Path, tr: float):
    """
    Save BOLD as CSV: rows=timepoints, columns=regions.
    First row is header (R001, R002, ...).
    """
    n_regions, n_tp = bold.shape
    header = ",".join(f"R{i+1:03d}" for i in range(n_regions))
    timestamps = np.arange(n_tp) * tr
    with open(path, "w") as f:
        f.write("time," + header + "\n")
        for t in range(n_tp):
            vals = ",".join(f"{bold[r, t]:.4f}" for r in range(n_regions))
            f.write(f"{timestamps[t]:.2f},{vals}\n")


def save_fc_csv(fc: np.ndarray, path: Path):
    """Save functional connectivity matrix as NxN CSV."""
    n = fc.shape[0]
    header = ",".join(f"R{i+1:03d}" for i in range(n))
    with open(path, "w") as f:
        f.write("," + header + "\n")
        for i in range(n):
            row = ",".join(f"{fc[i, j]:.4f}" for j in range(n))
            f.write(f"R{i+1:03d},{row}\n")


# ─── DB insert via psql ───────────────────────────────────────────────────────

def psql(sql: str):
    result = subprocess.run(
        ["docker", "exec", "brainforge-postgres-1", "psql", "-U", "brainforge", "-d", "brainforge", "-c", sql],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"psql error: {result.stderr}")
    return result.stdout


def insert_dataset(name: str, description: str, fmt: str, source: str, 
                   file_path: str, metadata: dict) -> str:
    """Insert dataset record, return id."""
    meta_str = json.dumps(metadata).replace("'", "''")
    result = psql(f"""
        INSERT INTO datasets (id, name, description, format, source, metadata, created_at)
        VALUES (gen_random_uuid(), '{name}', '{description}', '{fmt}', '{source}', 
                '{meta_str}'::jsonb, now())
        RETURNING id;
    """)
    # Parse returned id
    lines = [l.strip() for l in result.strip().splitlines() if l.strip()]
    for line in lines:
        if '-' in line and len(line) == 36:
            return line
    return "unknown"


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("🧠 BrainForge Dataset Generator")
    print(f"   Output directory: {DATASETS_DIR}\n")

    for model_cfg in MODELS:
        model_name = model_cfg["name"]
        n_regions = model_cfg["regions"]
        tr = model_cfg["tr"]
        n_tp = model_cfg["n_tp"]
        n_sessions = model_cfg["sessions"]
        networks = model_cfg["networks"]

        print(f"📊 Model: {model_name}")
        print(f"   {n_regions} regions, {n_sessions} session(s), {n_tp} timepoints @ TR={tr}s")

        slug = model_name.lower().replace(" ", "_").replace("(", "").replace(")", "").replace("-", "_")

        all_bold_sessions = []

        for sess in range(1, n_sessions + 1):
            seed = 42 + sess * 100
            print(f"   Generating session {sess}/{n_sessions} (seed={seed})...", end=" ")

            bold = generate_bold_session(n_regions, n_tp, tr, networks, seed=seed)
            all_bold_sessions.append(bold)

            # Save BOLD timeseries
            bold_path = DATASETS_DIR / f"{slug}_rest_session{sess}.csv"
            save_bold_csv(bold, bold_path, tr)

            # Save FC matrix for this session
            fc = functional_connectivity(bold)
            fc_path = DATASETS_DIR / f"{slug}_fc_session{sess}.csv"
            save_fc_csv(fc, fc_path)

            print(f"✓ ({bold_path.stat().st_size // 1024}KB)")

            # Register in DB
            duration_s = n_tp * tr
            ds_id = insert_dataset(
                name=f"{model_name} — Resting-State Session {sess}",
                description=(
                    f"Synthetic resting-state fMRI BOLD timeseries for {model_name}. "
                    f"Session {sess}/{n_sessions}. {n_regions} regions, {n_tp} timepoints, TR={tr}s ({duration_s:.0f}s total). "
                    f"Generated with AR(1) network drivers → HRF convolution → bandpass filter. "
                    f"Includes pre-computed functional connectivity matrix."
                ),
                fmt="csv/bold",
                source="synthetic_generated",
                file_path=str(bold_path),
                metadata={
                    "model": model_name,
                    "n_regions": n_regions,
                    "n_timepoints": n_tp,
                    "tr_seconds": tr,
                    "session": sess,
                    "n_sessions": n_sessions,
                    "duration_seconds": duration_s,
                    "networks": list(networks.keys()),
                    "bold_file": str(bold_path),
                    "fc_file": str(fc_path),
                    "generation": {
                        "method": "AR1_network_drivers + HRF_convolution + bandpass",
                        "seed": seed,
                        "snr": 1.5,
                        "bandpass_hz": [0.01, 0.1],
                    },
                },
            )
            print(f"   DB id: {ds_id}")

        # Compute and save group-average FC
        if n_sessions > 1:
            avg_fc = np.mean([functional_connectivity(b) for b in all_bold_sessions], axis=0)
            avg_fc_path = DATASETS_DIR / f"{slug}_fc_group_average.csv"
            save_fc_csv(avg_fc, avg_fc_path)
            print(f"   Saved group-average FC → {avg_fc_path.name}")

            insert_dataset(
                name=f"{model_name} — Group-Average FC",
                description=(
                    f"Group-average functional connectivity matrix for {model_name}. "
                    f"Averaged across {n_sessions} synthetic resting-state sessions. "
                    f"{n_regions}×{n_regions} Pearson correlation matrix, bandpass-filtered 0.01–0.1 Hz."
                ),
                fmt="csv/fc_matrix",
                source="synthetic_generated",
                file_path=str(avg_fc_path),
                metadata={
                    "model": model_name,
                    "n_regions": n_regions,
                    "n_sessions_averaged": n_sessions,
                    "fc_file": str(avg_fc_path),
                    "networks": list(networks.keys()),
                },
            )

        print()

    print("✅ All datasets generated and registered.")
    print(f"\nFiles saved to: {DATASETS_DIR}")
    print(f"View in app:    http://localhost:5173/datasets")
    print("\nFiles created:")
    for f in sorted(DATASETS_DIR.iterdir()):
        size_kb = f.stat().st_size // 1024
        print(f"  {f.name:<55} {size_kb:>6} KB")


if __name__ == "__main__":
    main()
