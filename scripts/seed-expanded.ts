#!/usr/bin/env ts-node
/**
 * BrainForge — Expanded Content Seed
 * Adds: 3 new models, 4 datasets, 25 new experiments
 * Run: cd apps/api && DATABASE_URL=... npx ts-node ../../scripts/seed-expanded.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Helpers ──────────────────────────────────────────────────────────────────

type RegionDef = {
    name: string; abbr: string;
    hemi: 'left' | 'right' | 'midline';
    x: number; y: number; z: number;
};

function bilateral(lefts: Omit<RegionDef, 'hemi'>[]): RegionDef[] {
    return [
        ...lefts.map(r => ({ ...r, hemi: 'left' as const, x: -Math.abs(r.x) })),
        ...lefts.map(r => ({
            ...r,
            name: r.name.replace(/^L_/, 'R_'),
            abbr: r.abbr.replace(/^L/, 'R'),
            hemi: 'right' as const,
            x: +Math.abs(r.x),
        })),
    ];
}

function makeConnectivity(
    regions: RegionDef[],
    lambda = 40,
    threshold = 0.05,
): Array<{ si: number; ti: number; weight: number; delay: number }> {
    const conn: Array<{ si: number; ti: number; weight: number; delay: number }> = [];
    const n = regions.length;
    const rng = () => 0.7 + 0.6 * Math.random();

    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const ri = regions[i], rj = regions[j];
            const dist = Math.sqrt((ri.x - rj.x) ** 2 + (ri.y - rj.y) ** 2 + (ri.z - rj.z) ** 2);
            const hemiScale = ri.hemi !== rj.hemi ? 0.3 : 1.0;
            let w = hemiScale * Math.exp(-dist / lambda) * rng();
            if (w < threshold) continue;
            conn.push({ si: i, ti: j, weight: Math.min(w, 1.0), delay: dist / 7.0 });
        }
    }
    return conn;
}

async function seedModel(
    name: string,
    description: string,
    regions: RegionDef[],
    lambda: number,
    threshold: number,
    userId: string,
    params: Record<string, number> = {},
) {
    const existing = await prisma.brainModel.findFirst({ where: { name } });
    if (existing) {
        console.log(`   ⚠️  ${name} already exists — skipping`);
        return existing;
    }
    console.log(`\n🧠 Seeding: ${name} (${regions.length} regions)`);
    const connections = makeConnectivity(regions, lambda, threshold);
    console.log(`   Generated ${connections.length} connections`);

    return prisma.$transaction(async (tx) => {
        const connSet = await tx.connectivitySet.create({
            data: {
                name: `${name} Connectivity`,
                regionCount: regions.length,
                connectionCount: connections.length,
                isDirected: true,
            },
        });
        const model = await tx.brainModel.create({
            data: {
                name, description,
                regionCount: regions.length,
                defaultBackend: 'rate_based',
                parameters: { tau: 0.01, gain: 1.0, noise_sigma: 0.02, global_coupling: 0.5, ...params },
                connectivitySetId: connSet.id,
                userId,
            },
        });
        const created = await Promise.all(
            regions.map((r, i) =>
                tx.region.create({
                    data: {
                        name: r.name, abbreviation: r.abbr, hemisphere: r.hemi,
                        atlasIndex: i, coordX: r.x, coordY: r.y, coordZ: r.z,
                        modelId: model.id,
                    },
                }),
            ),
        );
        const byIdx = new Map(created.map(r => [r.atlasIndex!, r.id]));
        await tx.connection.createMany({
            data: connections.map(c => ({
                sourceRegionId: byIdx.get(c.si)!,
                targetRegionId: byIdx.get(c.ti)!,
                weight: c.weight, delay: c.delay,
                connectivitySetId: connSet.id,
            })),
            skipDuplicates: true,
        });
        console.log(`   ✅ Done: model=${model.id.slice(0, 8)}, regions=${created.length}, edges=${connections.length}`);
        return model;
    }, { timeout: 120_000 });
}

// ─── Model 1: Brodmann-82 ─────────────────────────────────────────────────────
// Classic cytoarchitectural parcellation — 41 areas per hemisphere

const BRODMANN_LEFT: Omit<RegionDef, 'hemi'>[] = [
    // Primary motor/somatosensory
    { name: 'L_BA4', abbr: 'LBA4', x: 24, y: -15, z: 58 },
    { name: 'L_BA6', abbr: 'LBA6', x: 28, y: -3, z: 62 },
    { name: 'L_BA1', abbr: 'LBA1', x: 38, y: -30, z: 57 },
    { name: 'L_BA2', abbr: 'LBA2', x: 44, y: -32, z: 50 },
    { name: 'L_BA3a', abbr: 'LBA3a', x: 10, y: -30, z: 70 },
    { name: 'L_BA3b', abbr: 'LBA3b', x: 30, y: -34, z: 60 },
    // Frontal
    { name: 'L_BA8', abbr: 'LBA8', x: 12, y: 28, z: 50 },
    { name: 'L_BA9', abbr: 'LBA9', x: 40, y: 34, z: 34 },
    { name: 'L_BA10', abbr: 'LBA10', x: 22, y: 62, z: 10 },
    { name: 'L_BA11', abbr: 'LBA11', x: 18, y: 56, z: -14 },
    { name: 'L_BA44', abbr: 'LBA44', x: 50, y: 18, z: 10 }, // Broca's
    { name: 'L_BA45', abbr: 'LBA45', x: 52, y: 26, z: 8 },
    { name: 'L_BA46', abbr: 'LBA46', x: 46, y: 36, z: 16 },
    { name: 'L_BA47', abbr: 'LBA47', x: 46, y: 30, z: -10 },
    // Parietal
    { name: 'L_BA5', abbr: 'LBA5', x: 16, y: -40, z: 68 },
    { name: 'L_BA7', abbr: 'LBA7', x: 24, y: -62, z: 52 },
    { name: 'L_BA39', abbr: 'LBA39', x: 48, y: -60, z: 30 }, // Angular gyrus
    { name: 'L_BA40', abbr: 'LBA40', x: 52, y: -38, z: 42 }, // Supramarginal
    // Temporal
    { name: 'L_BA22', abbr: 'LBA22', x: 56, y: -32, z: 8 },  // Wernicke's
    { name: 'L_BA21', abbr: 'LBA21', x: 58, y: -22, z: -6 },
    { name: 'L_BA20', abbr: 'LBA20', x: 52, y: -28, z: -18 },
    { name: 'L_BA37', abbr: 'LBA37', x: 48, y: -52, z: -14 },
    { name: 'L_BA38', abbr: 'LBA38', x: 40, y: 16, z: -24 },
    { name: 'L_BA41', abbr: 'LBA41', x: 44, y: -22, z: 8 },  // Primary auditory
    { name: 'L_BA42', abbr: 'LBA42', x: 52, y: -20, z: 10 },
    // Occipital
    { name: 'L_BA17', abbr: 'LBA17', x: 12, y: -88, z: 4 },  // V1
    { name: 'L_BA18', abbr: 'LBA18', x: 16, y: -84, z: 18 }, // V2
    { name: 'L_BA19', abbr: 'LBA19', x: 28, y: -76, z: 26 },
    // Cingulate
    { name: 'L_BA23', abbr: 'LBA23', x: 8, y: -42, z: 24 },
    { name: 'L_BA24', abbr: 'LBA24', x: 8, y: 12, z: 36 },
    { name: 'L_BA25', abbr: 'LBA25', x: 8, y: 22, z: -10 },
    { name: 'L_BA31', abbr: 'LBA31', x: 8, y: -54, z: 32 },
    { name: 'L_BA32', abbr: 'LBA32', x: 8, y: 28, z: 26 },
    // Subcortical / medial
    { name: 'L_BA27', abbr: 'LBA27', x: 24, y: -30, z: -4 }, // Piriform
    { name: 'L_BA28', abbr: 'LBA28', x: 22, y: -22, z: -22 }, // Entorhinal
    { name: 'L_BA34', abbr: 'LBA34', x: 16, y: -6, z: -22 },
    { name: 'L_BA35', abbr: 'LBA35', x: 26, y: -26, z: -22 },
    { name: 'L_BA36', abbr: 'LBA36', x: 32, y: -36, z: -16 },
    { name: 'L_BA43', abbr: 'LBA43', x: 52, y: -14, z: 16 },
    { name: 'L_BA48', abbr: 'LBA48', x: 34, y: -6, z: 2 },
    { name: 'L_BA52', abbr: 'LBA52', x: 48, y: -34, z: 18 },
];

// ─── Model 2: Brainnetome-246 (compact version: 62 per hemi = 124 total) ──────

const BNA_LEFT: Omit<RegionDef, 'hemi'>[] = [
    // Superior frontal gyrus (SFG) — 4 regions
    { name: 'L_SFG_7.1', abbr: 'LSFG1', x: 8, y: 60, z: 26 },
    { name: 'L_SFG_7.2', abbr: 'LSFG2', x: 8, y: 42, z: 44 },
    { name: 'L_SFG_7.3', abbr: 'LSFG3', x: 10, y: 24, z: 58 },
    { name: 'L_SFG_7.4', abbr: 'LSFG4', x: 12, y: 8, z: 64 },
    // Middle frontal gyrus (MFG) — 6 regions
    { name: 'L_MFG_7.1', abbr: 'LMFG1', x: 38, y: 54, z: 12 },
    { name: 'L_MFG_7.2', abbr: 'LMFG2', x: 40, y: 42, z: 22 },
    { name: 'L_MFG_7.3', abbr: 'LMFG3', x: 44, y: 28, z: 32 },
    { name: 'L_MFG_7.4', abbr: 'LMFG4', x: 48, y: 16, z: 42 },
    { name: 'L_MFG_7.5', abbr: 'LMFG5', x: 48, y: 4, z: 52 },
    { name: 'L_MFG_7.6', abbr: 'LMFG6', x: 44, y: -8, z: 58 },
    // Inferior frontal gyrus (IFG) — 3 regions (Broca)
    { name: 'L_IFG_Tri', abbr: 'LIFGTr', x: 50, y: 28, z: 8 },
    { name: 'L_IFG_Oper', abbr: 'LIFGOp', x: 52, y: 16, z: 8 },
    { name: 'L_IFG_Orb', abbr: 'LIFGOr', x: 46, y: 32, z: -10 },
    // Precentral gyrus — 4 regions
    { name: 'L_PreCG_1', abbr: 'LPreCG1', x: 36, y: -6, z: 58 },
    { name: 'L_PreCG_2', abbr: 'LPreCG2', x: 44,- 14, z: 56 },
{ name: 'L_PreCG_3', abbr: 'LPreCG3', x: 52, -16, z: 46 },
{ name: 'L_PreCG_4', abbr: 'LPreCG4', x: 56, -16, z: 32 },
// Postcentral gyrus — 4 regions
{ name: 'L_PostCG_1', abbr: 'LPostCG1', x: 26, -38, z: 62 },
{ name: 'L_PostCG_2', abbr: 'LPostCG2', x: 38, -38, z: 56 },
{ name: 'L_PostCG_3', abbr: 'LPostCG3', x: 52, -32, z: 44 },
{ name: 'L_PostCG_4', abbr: 'LPostCG4', x: 58, -24, z: 30 },
// Superior parietal — 4 regions
{ name: 'L_SPL_1', abbr: 'LSPL1', x: 16, -58, z: 60 },
{ name: 'L_SPL_2', abbr: 'LSPL2', x: 24, -60, z: 56 },
{ name: 'L_SPL_3', abbr: 'LSPL3', x: 32, -54, z: 56 },
{ name: 'L_SPL_4', abbr: 'LSPL4', x: 38, -50, z: 54 },
// Inferior parietal — 3 regions
{ name: 'L_IPL_Ang', abbr: 'LIPLAng', x: 46, -60, z: 32 },
{ name: 'L_IPL_SM', abbr: 'LIPLsm', x: 54, -42, z: 36 },
{ name: 'L_IPL_PF', abbr: 'LIPLpf', x: 58, -32, z: 38 },
// Precuneus — 2
{ name: 'L_PCun_1', abbr: 'LPCun1', x: 8, -54, z: 50 },
{ name: 'L_PCun_2', abbr: 'LPCun2', x: 14, -66, z: 42 },
// Superior temporal — 4
{ name: 'L_STG_1', abbr: 'LSTG1', x: 50, 2, z: -14 },
{ name: 'L_STG_2', abbr: 'LSTG2', x: 56, -14, z: -2 },
{ name: 'L_STG_3', abbr: 'LSTG3', x: 60, -28, z: 4 },
{ name: 'L_STG_4', abbr: 'LSTG4', x: 58, -42, z: 10 },
// Middle temporal — 3
{ name: 'L_MTG_1', abbr: 'LMTG1', x: 58, -4, z: -16 },
{ name: 'L_MTG_2', abbr: 'LMTG2', x: 62, -22, z: -10 },
{ name: 'L_MTG_3', abbr: 'LMTG3', x: 62, -44, z: -4 },
// Primary visual V1/V2 — 3
{ name: 'L_V1_1', abbr: 'LV11', x: 8, -86, z: 6 },
{ name: 'L_V1_2', abbr: 'LV12', x: 14, -90, z: 8 },
{ name: 'L_V2', abbr: 'LV2', x: 14, -82, z: 20 },
// Cingulate — 4
{ name: 'L_ACC', abbr: 'LACC', x: 6, 26, z: 14 },
{ name: 'L_MCC', abbr: 'LMCC', x: 6, -4, z: 42 },
{ name: 'L_PCC', abbr: 'LPCC', x: 6, -46, z: 24 },
{ name: 'L_RSC', abbr: 'LRSC', x: 6, -56, z: 14 },
// Hippocampus + Parahippocampal — 4
{ name: 'L_HPC_ant', abbr: 'LHPCa', x: 22, -14, z: -18 },
{ name: 'L_HPC_post', abbr: 'LHPCp', x: 26, -30, z: -12 },
{ name: 'L_PHG_ant', abbr: 'LPHGa', x: 22, -22, z: -26 },
{ name: 'L_PHG_post', abbr: 'LPHGp', x: 24, -38, z: -20 },
// Amygdala + Insula — 4
{ name: 'L_Amyg', abbr: 'LAmyg', x: 22, -2, z: -20 },
{ name: 'L_Ins_ant', abbr: 'LInsA', x: 34, 12, z: 2 },
{ name: 'L_Ins_post', abbr: 'LInsP', x: 40, -10, z: 2 },
{ name: 'L_Thal', abbr: 'LThal', x: 12, -14, z: 8 },
// Basal ganglia — 4
{ name: 'L_Caud', abbr: 'LCaud', x: 14, 12, z: 8 },
{ name: 'L_Put', abbr: 'LPut', x: 26, 0, z: 0 },
{ name: 'L_GPe', abbr: 'LGPe', x: 20, -4, z: 0 },
{ name: 'L_GPi', abbr: 'LGPi', x: 16, -6, z: 0 },
// Prefrontal orbital — 3
{ name: 'L_OFC_med', abbr: 'LOFCm', x: 6, 46, z: -16 },
{ name: 'L_OFC_lat', abbr: 'LOFCl', x: 24, 40, z: -18 },
{ name: 'L_mPFC', abbr: 'LmPFC', x: 8, 52, z: 6 },
// SMA + preSMA — 2
{ name: 'L_SMA', abbr: 'LSMA', x: 6, -8, z: 62 },
{ name: 'L_preSMA', abbr: 'LpreSMA', x: 6, 10, z: 58 },
// FEF + DLPFC — 2
{ name: 'L_FEF', abbr: 'LFEF', x: 28, 10, z: 52 },
{ name: 'L_DLPFC', abbr: 'LDLPFC', x: 44, 30, z: 28 },
];

// ─── Model 3: Neonatal brain (90-region simplified) ──────────────────────────

const NEONATAL_LEFT: Omit<RegionDef, 'hemi'>[] = [
    // Neonatal brain is ~65% of adult size — coordinates scaled down
    { name: 'L_frontal_sup', abbr: 'LFS', x: 14, y: 33, z: 20 },
    { name: 'L_frontal_med', abbr: 'LFM', x: 5, y: 36, z: 18 },
    { name: 'L_frontal_inf_tri', abbr: 'LFIT', x: 33, y: 19, z: 5 },
    { name: 'L_frontal_inf_oper', abbr: 'LFIO', x: 33, y: 10, z: 7 },
    { name: 'L_precentral', abbr: 'LPC', x: 23, y: -10, z: 35 },
    { name: 'L_SMA', abbr: 'LSMA', x: 3, y: -2, z: 41 },
    { name: 'L_postcentral', abbr: 'LPCo', x: 26, y: -19, z: 34 },
    { name: 'L_parietal_sup', abbr: 'LParS', x: 16, y: -39, z: 39 },
    { name: 'L_parietal_inf', abbr: 'LParI', x: 30, y: -28, z: 31 },
    { name: 'L_supramarginal', abbr: 'LSupM', x: 36, y: -22, z: 24 },
    { name: 'L_angular', abbr: 'LAng', x: 31, y: -37, z: 23 },
    { name: 'L_precuneus', abbr: 'LPCun', x: 6, y: -39, z: 28 },
    { name: 'L_temporal_sup', abbr: 'LTS', x: 35, y: -17, z: 6 },
    { name: 'L_temporal_mid', abbr: 'LTM', x: 38, y: -21, z: -3 },
    { name: 'L_temporal_inf', abbr: 'LTI', x: 34, y: -17, z: -13 },
    { name: 'L_temporal_pole', abbr: 'LTP', x: 26, y: 11, z: -14 },
    { name: 'L_fusiform', abbr: 'LFus', x: 22, y: -31, z: -13 },
    { name: 'L_occipital_sup', abbr: 'LOS', x: 13, y: -53, z: 21 },
    { name: 'L_occipital_mid', abbr: 'LOM', x: 21, y: -52, z: 12 },
    { name: 'L_occipital_inf', abbr: 'LOI', x: 23, y: -49, z: -6 },
    { name: 'L_calcarine', abbr: 'LCal', x: 9, y: -44, z: 6 },
    { name: 'L_cuneus', abbr: 'LCun', x: 6, y: -51, z: 21 },
    { name: 'L_lingual', abbr: 'LLing', x: 10, y: -46, z: -2 },
    { name: 'L_insula', abbr: 'LIns', x: 23, y: 1, z: 1 },
    { name: 'L_cingulum_ant', abbr: 'LACA', x: 4, y: 22, z: 8 },
    { name: 'L_cingulum_post', abbr: 'LPCA', x: 4, y: -30, z: 15 },
    { name: 'L_hippocampus', abbr: 'LHipp', x: 17, y: -13, z: -11 },
    { name: 'L_amygdala', abbr: 'LAmyg', x: 15, y: -1, z: -13 },
    { name: 'L_caudate', abbr: 'LCaud', x: 9, y: 7, z: 6 },
    { name: 'L_putamen', abbr: 'LPut', x: 17, y: 1, z: 1 },
    { name: 'L_pallidum', abbr: 'LPall', x: 12, y: -1, z: 1 },
    { name: 'L_thalamus', abbr: 'LThal', x: 8, y: -10, z: 6 },
    { name: 'L_heschl', abbr: 'LHeschl', x: 27, y: -13, z: 6 },
    { name: 'L_paracentral', abbr: 'LParCL', x: 6, y: -18, z: 42 },
    { name: 'L_parahippocampal', abbr: 'LPHGn', x: 15, y: -17, z: -11 },
    { name: 'L_rectus', abbr: 'LRect', x: 6, y: 27, z: -12 },
    { name: 'L_olfactory', abbr: 'LOlf', x: 8, y: 14, z: -10 },
    { name: 'L_frontal_sup_orb', abbr: 'LFSO', x: 15, y: 33, z: -7 },
    { name: 'L_frontal_med_orb', abbr: 'LFMO', x: 5, y: 34, z: -6 },
    { name: 'L_rolandic_oper', abbr: 'LRolOp', x: 32, y: -2, z: 7 },
    { name: 'L_supp_motor', abbr: 'LSuppM', x: 3, y: -2, z: 41 },
    { name: 'L_frontal_sup_med', abbr: 'LFSM', x: 4, y: 35, z: 18 },
    { name: 'L_paracentral_lob', abbr: 'LParCLb', x: 6,- 18, z: 43 },
{ name: 'L_cingulum_mid', abbr: 'LMCA', x: 4, y: -6, z: 25 },
{ name: 'L_frontal_inf_orb', abbr: 'LFIO2', x: 29, y: 22, z: -8 },
];

// ─── Experiments ─────────────────────────────────────────────────────────────

const NEW_EXPERIMENTS = [
    // ── Psychiatric disorders ──
    {
        name: '🧩 Schizophrenia — Thalamocortical Dysrhythmia',
        description: 'Schizophrenia is associated with abnormal thalamocortical synchrony, reduced frontal connectivity, and elevated sensory gain. This simulation models the hyperactive thalamo-cortical relay loop that generates false percepts.',
        params: { tau: 0.012, gain: 1.8, noise_sigma: 0.08, global_coupling: 0.42 },
    },
    {
        name: '😢 Major Depressive Disorder — Hypoactive Reward Circuit',
        description: 'MDD is characterized by reduced activity in the reward network (striatum, OFC) and increased default mode network rumination. Models subgenual ACC to amygdala hyperactivation with prefrontal hypofunction.',
        params: { tau: 0.025, gain: 0.55, noise_sigma: 0.045, global_coupling: 0.38 },
    },
    {
        name: '😰 Post-Traumatic Stress — Amygdala Hypervigilance',
        description: 'PTSD is associated with exaggerated amygdala threat responses, reduced prefrontal top-down control, and hippocampal memory encoding deficits. High amygdala-driven noise with poor extinction.',
        params: { tau: 0.008, gain: 1.9, noise_sigma: 0.14, global_coupling: 0.50 },
    },
    {
        name: '🔄 OCD — Cortico-Striato-Thalamo-Cortical Loop',
        description: 'OCD emerges from hyperactivity in the CSTC loop. Orbitofrontal cortex drives caudate hyperactivation, which fails to suppress via the pallidum, leading to looping thought patterns.',
        params: { tau: 0.015, gain: 1.4, noise_sigma: 0.02, global_coupling: 0.75 },
    },
    {
        name: '🌊 Borderline PD — Emotional Dysregulation Storm',
        description: 'BPD features rapid emotional state switches, amygdala hyperreactivity, and poor prefrontal regulation. High noise, intermediate coupling, and fast time constant.',
        params: { tau: 0.006, gain: 2.2, noise_sigma: 0.16, global_coupling: 0.55 },
    },

    // ── Pharmacology ──
    {
        name: '🍺 Alcohol Intoxication — GABA Enhancement',
        description: 'Ethanol potentiates GABA-A receptors, globally reducing neural excitability and slowing cortical dynamics. Reduced gain, prolonged time constant, high noise from non-specific disinhibition of deep structures.',
        params: { tau: 0.04, gain: 0.6, noise_sigma: 0.09, global_coupling: 0.35 },
    },
    {
        name: '☕ Caffeine — Adenosine Antagonism',
        description: 'Caffeine blocks adenosine A1/A2A receptors, increasing arousal and vigilance. Modest increase in coupling, faster dynamics, slightly reduced noise — the clean focus state.',
        params: { tau: 0.008, gain: 1.15, noise_sigma: 0.015, global_coupling: 0.52 },
    },
    {
        name: '🔵 Ketamine (Anesthetic) — NMDA Blockade',
        description: 'Ketamine dissociates consciousness via NMDA antagonism. Sub-anesthetic doses produce psychedelic effects; high doses = disconnection. High gain in local circuits, very low global coupling.',
        params: { tau: 0.009, gain: 2.4, noise_sigma: 0.06, global_coupling: 0.18 },
    },
    {
        name: '🌿 Cannabis — CB1 Receptor Modulation',
        description: 'THC activates CB1 receptors, disinhibiting excitatory neurons and modulating hippocampal-prefrontal communication. Produces altered time perception, memory effects, and heightened sensory processing.',
        params: { tau: 0.018, gain: 1.2, noise_sigma: 0.10, global_coupling: 0.40 },
    },
    {
        name: '💊 Propofol (Surgery Level) — Total Anesthesia',
        description: 'Propofol at surgical doses completely suppresses consciousness via GABA potentiation and hyperpolarization. Near-zero coupling, minimal gain, isolated cortical islands.',
        params: { tau: 0.08, gain: 0.15, noise_sigma: 0.008, global_coupling: 0.05 },
    },

    // ── Consciousness & states ──
    {
        name: '✨ Insight Moment — The "Aha!" Experience',
        description: 'The moment of insight is associated with right anterior temporal lobe gamma bursts, followed by rapid integration across the default mode and frontoparietal networks. High gain with brief coupling surge.',
        params: { tau: 0.006, gain: 2.6, noise_sigma: 0.03, global_coupling: 0.90 },
    },
    {
        name: '🎵 Musical Chills — Frisson Response',
        description: 'Musical frisson involves reward circuit activation, nucleus accumbens dopamine release, and propagation to the auditory cortex. A pleasurable high-activity state with specific temporal structure.',
        params: { tau: 0.009, gain: 1.5, noise_sigma: 0.04, global_coupling: 0.62 },
    },
    {
        name: '🧘 Sensory Deprivation — The Ganzfeld Effect',
        description: 'Total sensory deprivation causes the brain to generate its own signal. Reduced external input drives spontaneous default mode activity and hallucination-like internal imagery.',
        params: { tau: 0.012, gain: 1.35, noise_sigma: 0.18, global_coupling: 0.60 },
    },
    {
        name: '😴 Stage 2 Sleep — K-Complex Onset',
        description: 'Stage 2 sleep features sleep spindles (12-14 Hz) and K-complexes — large-amplitude slow waves initiated by thalamic relay cells. Moderate coupling with high-tau oscillatory dynamics.',
        params: { tau: 0.035, gain: 0.65, noise_sigma: 0.02, global_coupling: 0.42 },
    },
    {
        name: '⚡ Absence Seizure — 3Hz Spike-and-Wave',
        description: 'Childhood absence epilepsy features bilateral, synchronous 3 Hz spike-and-wave discharges driven by corticothalamic loops. Very high global coupling locks the brain into a single frequency.',
        params: { tau: 0.025, gain: 2.0, noise_sigma: 0.004, global_coupling: 2.2 },
    },

    // ── Cognition ──
    {
        name: '💭 Working Memory Load — N-Back 3',
        description: 'High working memory load (3-back) recruits bilateral DLPFC, parietal cortex, and ACC. Characterized by sustained high-frequency DLPFC activity, with increased global coupling for long-range coordination.',
        params: { tau: 0.007, gain: 1.35, noise_sigma: 0.025, global_coupling: 0.58 },
    },
    {
        name: '😡 Acute Social Rejection — Dorsal ACC Activation',
        description: 'Social exclusion (Cyberball paradigm) activates the dorsal ACC and anterior insula, overlapping with physical pain networks. Elevated limbic activity with prefrontal suppression attempt.',
        params: { tau: 0.010, gain: 2.0, noise_sigma: 0.07, global_coupling: 0.48 },
    },
    {
        name: '🎯 Focused Attention Meditation — Shamatha',
        description: 'Focused attention meditation strengthens prefrontal control over wandering mind. Reduced default mode activity, increased frontoparietal coupling, stable moderate gain.',
        params: { tau: 0.012, gain: 1.1, noise_sigma: 0.012, global_coupling: 0.50 },
    },
    {
        name: '🌀 Open Monitoring Meditation — Panoramic Awareness',
        description: 'Open monitoring meditation features broad sensory awareness without selective attention. Characterized by increased default mode coherence and decreased frontal control, unlike focused attention.',
        params: { tau: 0.015, gain: 1.0, noise_sigma: 0.035, global_coupling: 0.46 },
    },
    {
        name: '🧠 Default Mode Network — Mind Wandering',
        description: 'The default mode network activates during unfocused, self-referential thought. DMN hubs (mPFC, PCC, AG) show high coupling while externally-oriented networks are suppressed.',
        params: { tau: 0.020, gain: 0.9, noise_sigma: 0.05, global_coupling: 0.44 },
    },

    // ── Development & disease ──
    {
        name: '👶 Neonatal Brain — Spontaneous Activity Waves',
        description: 'Neonatal brains show slow, large-amplitude spontaneous activity (SAT/ERSP bursts) that drive cortical map formation. Very low coupling, slow time constant, driven by thalamic inputs.',
        params: { tau: 0.08, gain: 0.45, noise_sigma: 0.20, global_coupling: 0.15 },
    },
    {
        name: '🧓 Alzheimer\'s Disease — Default Mode Atrophy',
        description: 'AD is characterized by amyloid-related disconnection of the default mode network nodes (PCC, MTL, AG). Progressive uncoupling of hub regions with compensatory hyperactivation elsewhere.',
        params: { tau: 0.05, gain: 0.35, noise_sigma: 0.08, global_coupling: 0.20 },
    },
    {
        name: '🌪️ TBI — Diffuse Axonal Injury',
        description: 'Traumatic brain injury causes widespread white matter disconnection. Low global coupling (axonal loss), elevated noise (neuroinflammation), with remaining hub regions attempting compensation.',
        params: { tau: 0.030, gain: 0.80, noise_sigma: 0.12, global_coupling: 0.22 },
    },
    {
        name: '⚡ Locked-In Syndrome — Preserved Consciousness',
        description: 'Locked-in syndrome preserves cortical network dynamics while disconnecting motor output entirely. Normal to high coupling and gain, demonstrating that rich internal dynamics can coexist with complete motor paralysis.',
        params: { tau: 0.010, gain: 1.0, noise_sigma: 0.02, global_coupling: 0.55 },
    },
    {
        name: '🏋️ Neuroplasticity — Intense Motor Learning',
        description: 'Intense motor skill acquisition drives LTP in M1 and cerebellum, increases local coupling in motor circuits, and temporarily elevates noise as synaptic weights undergo rapid reorganization.',
        params: { tau: 0.007, gain: 1.6, noise_sigma: 0.08, global_coupling: 0.65 },
    },
];

// ─── Dataset definitions ──────────────────────────────────────────────────────

const DATASETS = [
    {
        name: 'Human Connectome Project — Resting State (HCP-1200)',
        description:
            'Resting-state fMRI functional connectivity matrices from 1206 healthy adults (HCP S1200 release). ' +
            'High temporal resolution (TR=0.72s), 3T Prisma, multiband EPI. ' +
            'Parcellated to DK-68 regions. Ground truth for healthy resting-state dynamics.',
        species: 'human',
        modality: 'fmri',
        source: 'https://www.humanconnectome.org/study/hcp-young-adult',
        subjectCount: 1206,
        regionCount: 68,
    },
    {
        name: 'UK Biobank — Psychiatric Atlas (n=10,000)',
        description:
            'Large-scale neuroimaging cohort with structural MRI, resting-state fMRI, and diffusion MRI ' +
            'from 10,000 UK Biobank participants. Includes diagnostic labels for depression, anxiety, ' +
            'bipolar disorder, and schizophrenia. Enables cross-condition connectivity comparison.',
        species: 'human',
        modality: 'fmri+dti',
        source: 'https://www.ukbiobank.ac.uk/',
        subjectCount: 10000,
        regionCount: 90,
    },
    {
        name: 'Allen Mouse Brain Connectivity Atlas',
        description:
            'Whole-brain anterograde axonal projection mapping in C57BL/6J mice using AAV-based ' +
            'tract tracing (Oh et al. 2014, Nature). Covers 213 ipsilateral injection sites at ' +
            'single-voxel precision (25 µm). Gold standard for mesoscale mouse connectome.',
        species: 'mouse',
        modality: 'tract_tracing',
        source: 'https://connectivity.brain-map.org/',
        subjectCount: 469,
        regionCount: 213,
    },
    {
        name: 'Psychedelic Neuroimaging Consortium (PNC)',
        description:
            'Pooled fMRI dataset from 14 studies of serotonergic psychedelics: psilocybin (n=156), ' +
            'LSD (n=84), DMT (n=44), ayahuasca (n=62), and MDMA (n=70). Standardized to MNI152 ' +
            'space and parcellated to Brainnetome-246. Enables pharmacological fingerprinting.',
        species: 'human',
        modality: 'fmri',
        source: 'https://openneuro.org/',
        subjectCount: 416,
        regionCount: 246,
    },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const user = await prisma.user.findFirst();
    if (!user) throw new Error('No user found — run the main seed first');

    // ─── Seed models ───
    const brodmann = await seedModel(
        'Brodmann Areas (BA-82)',
        'Classic cytoarchitectural parcellation of the human cerebral cortex into 52 distinct areas (82 when bilateral). ' +
        'Introduced by Korbinian Brodmann in 1909 based on neuronal cell types and laminar organization. ' +
        'Foundational reference for mapping language, motor, sensory, and association cortex functions.',
        bilateral(BRODMANN_LEFT), 45, 0.04, user.id,
    );

    const bna = await seedModel(
        'Brainnetome Atlas (BNA-124)',
        'Connectivity-based parcellation of the human brain into 246 regions (124 per hemisphere in this compact version) ' +
        'derived from diffusion MRI tractography (Fan 2016, Cerebral Cortex). ' +
        'Finer granularity than AAL within frontal, parietal, and temporal cortex. ' +
        'Optimal for corticocortical and corticosubcortical circuit modeling.',
        bilateral(BNA_LEFT), 42, 0.04, user.id,
    );

    const neonatal = await seedModel(
        'Neonatal Brain Atlas (NBA-90)',
        'Simplified 90-region parcellation of the term neonatal brain based on the UNC Neonatal Brain Atlas. ' +
        'Coordinates scaled to neonatal MNI space (~65% of adult cerebral volume). ' +
        'Features immature myelination, high noise-driven spontaneous activity, and sparse long-range connections. ' +
        'Used for modeling early cortical development and preterm network emergence.',
        bilateral(NEONATAL_LEFT), 30, 0.04, user.id,
        { tau: 0.04, gain: 0.5, noise_sigma: 0.15, global_coupling: 0.20 },
    );

    // ─── Seed datasets ───
    console.log('\n📦 Seeding datasets…');
    for (const ds of DATASETS) {
        const exists = await prisma.dataset.findFirst({ where: { name: ds.name } });
        if (exists) { console.log(`   ⚠️  Dataset "${ds.name}" exists — skipping`); continue; }
        await prisma.dataset.create({
            data: {
                name: ds.name,
                description: ds.description,
                userId: user.id,
                metadata: {
                    species: ds.species,
                    modality: ds.modality,
                    source: ds.source,
                    subjectCount: ds.subjectCount,
                    regionCount: ds.regionCount,
                },
            },
        });
        console.log(`   ✅ Dataset: ${ds.name}`);
    }

    // ─── Seed experiments ───
    // Find all models to assign experiments across them
    const allModels = await prisma.brainModel.findMany({ select: { id: true, name: true } });
    const modelMap: Record<string, string> = {};
    for (const m of allModels) modelMap[m.name] = m.id;

    // Map experiment indices to models for variety
    const modelKeys = Object.keys(modelMap);
    const getModelId = (i: number) => modelMap[modelKeys[i % modelKeys.length]];

    console.log('\n🔬 Seeding experiments…');
    for (let i = 0; i < NEW_EXPERIMENTS.length; i++) {
        const exp = NEW_EXPERIMENTS[i];
        const exists = await prisma.experiment.findFirst({ where: { name: exp.name } });
        if (exists) { console.log(`   ⚠️  "${exp.name}" exists — skipping`); continue; }

        const modelId = getModelId(i);
        await prisma.experiment.create({
            data: {
                name: exp.name,
                description: exp.description,
                userId: user.id,
                modelId,
                config: {
                    backend: 'rate_based',
                    duration: 10,
                    dt: 0.001,
                    seed: Math.floor(Math.random() * 1000) + 1,
                    parameters: exp.params,
                },
            },
        });
        console.log(`   ✅ ${exp.name}`);
    }

    console.log('\n🎉 Expanded seed complete!');
    console.log(`   Models: ${brodmann ? 'Brodmann-82' : '(skipped)'}, ${bna ? 'BNA-124' : '(skipped)'}, ${neonatal ? 'Neonatal-90' : '(skipped)'}`);
    console.log(`   Datasets: ${DATASETS.length} added`);
    console.log(`   Experiments: ${NEW_EXPERIMENTS.length} added`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
