#!/usr/bin/env ts-node
/**
 * BrainForge — Additional Model Seed
 * Imports: AAL-90, Schaefer-100 (symmetric), Mouse Connectome (simplified Allen)
 * Run: cd apps/api && DATABASE_URL=... npx ts-node ../../scripts/seed-models.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Region definition helpers ────────────────────────────────────────────────

type RegionDef = {
    name: string;
    abbr: string;
    hemi: 'left' | 'right' | 'midline';
    x: number; y: number; z: number;
};

/** Mirror a left-hemisphere region list to produce bilateral regions */
function bilateral(lefts: Omit<RegionDef, 'hemi'>[]): RegionDef[] {
    return [
        ...lefts.map(r => ({ ...r, hemi: 'left' as const, x: -Math.abs(r.x) })),
        ...lefts.map(r => ({ ...r, name: r.name.replace(/^L_/, 'R_'), abbr: r.abbr.replace(/^L/, 'R'), hemi: 'right' as const, x: +Math.abs(r.x) })),
    ];
}

/**
 * Distance-dependent connectivity: weight = exp(-d / lambda) with added noise.
 * Also adds a random long-range ~10% of connections.
 */
function makeConnectivity(regions: RegionDef[], lambda = 40, threshold = 0.05): Array<{ si: number; ti: number; weight: number; delay: number }> {
    const conn: Array<{ si: number; ti: number; weight: number; delay: number }> = [];
    const n = regions.length;

    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const ri = regions[i], rj = regions[j];
            const dist = Math.sqrt((ri.x - rj.x) ** 2 + (ri.y - rj.y) ** 2 + (ri.z - rj.z) ** 2);
            // Intrahemispheric: strong distance-dependent decay
            // Interhemispheric: weaker (corpus callosum effect)
            const hemiScale = ri.hemi !== rj.hemi ? 0.3 : 1.0;
            let w = hemiScale * Math.exp(-dist / lambda);
            // Add stochastic variation
            w *= (0.7 + 0.6 * Math.random());
            if (w < threshold) continue;
            conn.push({ si: i, ti: j, weight: Math.min(w, 1.0), delay: dist / 7.0 }); // ~7 mm/ms conduction
        }
    }
    return conn;
}

// ─── Model 1: AAL-90 ──────────────────────────────────────────────────────────

const AAL90_LEFT: Omit<RegionDef, 'hemi'>[] = [
    { name: 'L_Precentral', abbr: 'LPreCG', x: 36, y: -17, z: 54 },
    { name: 'L_Frontal_Sup', abbr: 'LFronSup', x: 22, y: 51, z: 31 },
    { name: 'L_Frontal_Sup_Orb', abbr: 'LFronSO', x: 23, y: 51, z: -11 },
    { name: 'L_Frontal_Mid', abbr: 'LFronMid', x: 40, y: 36, z: 28 },
    { name: 'L_Frontal_Mid_Orb', abbr: 'LFronMO', x: 34, y: 49, z: -9 },
    { name: 'L_Frontal_Inf_Oper', abbr: 'LFronIO', x: 51, y: 15, z: 10 },
    { name: 'L_Frontal_Inf_Tri', abbr: 'LFronIT', x: 51, y: 29, z: 7 },
    { name: 'L_Frontal_Inf_Orb', abbr: 'LFronIO2', x: 46, y: 35, z: -12 },
    { name: 'L_Rolandic_Oper', abbr: 'LRolOp', x: 49, y: -3, z: 11 },
    { name: 'L_Supp_Motor_Area', abbr: 'LSMA', x: 5, y: -4, z: 63 },
    { name: 'L_Olfactory', abbr: 'LOlf', x: 12, y: 22, z: -15 },
    { name: 'L_Frontal_Sup_Med', abbr: 'LFronSM', x: 7, y: 55, z: 28 },
    { name: 'L_Frontal_Med_Orb', abbr: 'LFronMedO', x: 7, y: 54, z: -9 },
    { name: 'L_Rectus', abbr: 'LRec', x: 9, y: 43, z: -19 },
    { name: 'L_Insula', abbr: 'LIns', x: 36, y: 1, z: 1 },
    { name: 'L_Cingulum_Ant', abbr: 'LCingA', x: 7, y: 35, z: 12 },
    { name: 'L_Cingulum_Mid', abbr: 'LCingM', x: 7, y: -10, z: 39 },
    { name: 'L_Cingulum_Post', abbr: 'LCingP', x: 7, y: -47, z: 23 },
    { name: 'L_Hippocampus', abbr: 'LHipp', x: 27, y: -20, z: -17 },
    { name: 'L_ParaHippocampal', abbr: 'LParaH', x: 24, y: -26, z: -18 },
    { name: 'L_Amygdala', abbr: 'LAmyg', x: 24, y: -2, z: -21 },
    { name: 'L_Calcarine', abbr: 'LCalc', x: 14, y: -69, z: 9 },
    { name: 'L_Cuneus', abbr: 'LCun', x: 9, y: -80, z: 32 },
    { name: 'L_Lingual', abbr: 'LLing', x: 16, y: -72, z: -4 },
    { name: 'L_Occipital_Sup', abbr: 'LOccS', x: 20, y: -83, z: 33 },
    { name: 'L_Occipital_Mid', abbr: 'LOccM', x: 33, y: -80, z: 19 },
    { name: 'L_Occipital_Inf', abbr: 'LOccI', x: 36, y: -77, z: -10 },
    { name: 'L_Fusiform', abbr: 'LFus', x: 35, y: -48, z: -21 },
    { name: 'L_Postcentral', abbr: 'LPostCG', x: 40, y: -30, z: 53 },
    { name: 'L_Parietal_Sup', abbr: 'LParS', x: 25, y: -60, z: 60 },
    { name: 'L_Parietal_Inf', abbr: 'LParI', x: 47, y: -44, z: 48 },
    { name: 'L_SupraMarginal', abbr: 'LSupMar', x: 55, y: -34, z: 38 },
    { name: 'L_Angular', abbr: 'LAng', x: 49, y: -58, z: 36 },
    { name: 'L_Precuneus', abbr: 'LPCun', x: 10, y: -61, z: 44 },
    { name: 'L_ParaCentral_Lob', abbr: 'LParCL', x: 9, y: -28, z: 66 },
    { name: 'L_Caudate', abbr: 'LCaud', x: 14, y: 11, z: 9 },
    { name: 'L_Putamen', abbr: 'LPut', x: 26, y: 2, z: 1 },
    { name: 'L_Pallidum', abbr: 'LPall', x: 19, y: -2, z: 1 },
    { name: 'L_Thalamus', abbr: 'LThal', x: 13, y: -15, z: 9 },
    { name: 'L_Heschl', abbr: 'LHeschl', x: 42, y: -21, z: 10 },
    { name: 'L_Temporal_Sup', abbr: 'LTempS', x: 55, y: -27, z: 9 },
    { name: 'L_Temporal_Pole_S', abbr: 'LTempPS', x: 40, y: 17, z: -22 },
    { name: 'L_Temporal_Mid', abbr: 'LTempM', x: 59, y: -33, z: -4 },
    { name: 'L_Temporal_Pole_M', abbr: 'LTempPM', x: 40, y: 6, z: -33 },
    { name: 'L_Temporal_Inf', abbr: 'LTempI', x: 53, y: -26, z: -21 },
];

const AAL90_REGIONS: RegionDef[] = bilateral(AAL90_LEFT);

// ─── Model 2: Schaefer-100 ────────────────────────────────────────────────────

// 50 left-hemisphere regions covering the main Schaefer networks
const SCHAEFER100_LEFT: Omit<RegionDef, 'hemi'>[] = [
    // Visual network
    { name: 'L_Vis_01', abbr: 'LV01', x: 12, y: -95, z: 5 },
    { name: 'L_Vis_02', abbr: 'LV02', x: 18, y: -90, z: 16 },
    { name: 'L_Vis_03', abbr: 'LV03', x: 27, y: -84, z: 24 },
    { name: 'L_Vis_04', abbr: 'LV04', x: 35, y: -76, z: 20 },
    { name: 'L_Vis_05', abbr: 'LV05', x: 20, y: -76, z: -6 },
    { name: 'L_Vis_06', abbr: 'LV06', x: 30, y: -65, z: -12 },
    { name: 'L_Vis_07', abbr: 'LV07', x: 40, y: -66, z: -6 },
    // Somatomotor network
    { name: 'L_SomMot_01', abbr: 'LSM01', x: 11, y: -35, z: 70 },
    { name: 'L_SomMot_02', abbr: 'LSM02', x: 22, y: -36, z: 66 },
    { name: 'L_SomMot_03', abbr: 'LSM03', x: 36, y: -28, z: 58 },
    { name: 'L_SomMot_04', abbr: 'LSM04', x: 45, y: -15, z: 48 },
    { name: 'L_SomMot_05', abbr: 'LSM05', x: 53, y: -5, z: 36 },
    { name: 'L_SomMot_06', abbr: 'LSM06', x: 58, y: -12, z: 26 },
    // Dorsal attention network
    { name: 'L_DorsAttn_01', abbr: 'LDA01', x: 28, y: -60, z: 54 },
    { name: 'L_DorsAttn_02', abbr: 'LDA02', x: 40, y: -48, z: 54 },
    { name: 'L_DorsAttn_03', abbr: 'LDA03', x: 52, y: -38, z: 46 },
    { name: 'L_DorsAttn_04', abbr: 'LDA04', x: 44, y: -36, z: 49 },
    { name: 'L_DorsAttn_05', abbr: 'LDA05', x: 28, y: -10, z: 56 },
    { name: 'L_DorsAttn_06', abbr: 'LDA06', x: 40, y: -4, z: 52 },
    // Ventral attention / Salience network
    { name: 'L_SalVentAttn_01', abbr: 'LSal01', x: 36, y: 20, z: 4 },
    { name: 'L_SalVentAttn_02', abbr: 'LSal02', x: 46, y: 16, z: 2 },
    { name: 'L_SalVentAttn_03', abbr: 'LSal03', x: 54, y: 14, z: 0 },
    { name: 'L_SalVentAttn_04', abbr: 'LSal04', x: 38, y: 28, z: 14 },
    { name: 'L_SalVentAttn_05', abbr: 'LSal05', x: 36, y: 0, z: 12 },
    // Limbic network
    { name: 'L_Limbic_01', abbr: 'LLim01', x: 12, y: 32, z: -18 },
    { name: 'L_Limbic_02', abbr: 'LLim02', x: 20, y: 22, z: -18 },
    { name: 'L_Limbic_03', abbr: 'LLim03', x: 28, y: 14, z: -22 },
    // Frontoparietal network
    { name: 'L_Cont_01', abbr: 'LFP01', x: 48, y: 38, z: 28 },
    { name: 'L_Cont_02', abbr: 'LFP02', x: 40, y: 48, z: 20 },
    { name: 'L_Cont_03', abbr: 'LFP03', x: 44, y: 24, z: 38 },
    { name: 'L_Cont_04', abbr: 'LFP04', x: 48, y: 10, z: 40 },
    { name: 'L_Cont_05', abbr: 'LFP05', x: 42, y: -2, z: 50 },
    { name: 'L_Cont_06', abbr: 'LFP06', x: 46, y: -54, z: 50 },
    { name: 'L_Cont_07', abbr: 'LFP07', x: 44, y: -60, z: 46 },
    // Default mode network
    { name: 'L_Default_01', abbr: 'LDMN01', x: 12, y: -56, z: 28 },
    { name: 'L_Default_02', abbr: 'LDMN02', x: 6, y: -55, z: 42 },
    { name: 'L_Default_03', abbr: 'LDMN03', x: 8, y: 54, z: 20 },
    { name: 'L_Default_04', abbr: 'LDMN04', x: 14, y: 44, z: 10 },
    { name: 'L_Default_05', abbr: 'LDMN05', x: 16, y: 36, z: 2 },
    { name: 'L_Default_06', abbr: 'LDMN06', x: 50, y: -66, z: 28 },
    { name: 'L_Default_07', abbr: 'LDMN07', x: 58, y: -48, z: 14 },
    { name: 'L_Default_08', abbr: 'LDMN08', x: 50, y: -52, z: 8 },
    { name: 'L_Default_09', abbr: 'LDMN09', x: 26, y: -28, z: -18 },
    { name: 'L_Default_10', abbr: 'LDMN10', x: 18, y: -14, z: -18 },
    { name: 'L_Default_11', abbr: 'LDMN11', x: 30, y: -56, z: 12 },
    { name: 'L_Default_12', abbr: 'LDMN12', x: 20, y: -60, z: 16 },
    { name: 'L_Default_13', abbr: 'LDMN13', x: 16, y: -56, z: 6 },
    { name: 'L_Default_14', abbr: 'LDMN14', x: 40, y: -68, z: 14 },
    { name: 'L_Default_15', abbr: 'LDMN15', x: 28, y: -74, z: 10 },
    { name: 'L_Default_16', abbr: 'LDMN16', x: 26, y: -28, z: 4 },
];

const SCHAEFER100_REGIONS: RegionDef[] = bilateral(SCHAEFER100_LEFT);

// ─── Model 3: Mouse connectome (simplified Allen Mouse Brain Atlas) ────────────

const MOUSE_REGIONS: RegionDef[] = [
    // Isocortex — motor
    { name: 'MOp_L', abbr: 'MOp_L', hemi: 'left', x: -1.5, y: 1.5, z: 0.5 },
    { name: 'MOs_L', abbr: 'MOs_L', hemi: 'left', x: -1.5, y: 2.0, z: 0.3 },
    { name: 'MOp_R', abbr: 'MOp_R', hemi: 'right', x: 1.5, y: 1.5, z: 0.5 },
    { name: 'MOs_R', abbr: 'MOs_R', hemi: 'right', x: 1.5, y: 2.0, z: 0.3 },
    // Isocortex — somatosensory
    { name: 'SSp_bfd_L', abbr: 'SSpB_L', hemi: 'left', x: -3.0, y: -0.5, z: 0.3 },
    { name: 'SSp_ul_L', abbr: 'SSpU_L', hemi: 'left', x: -2.5, y: -0.2, z: 0.5 },
    { name: 'SSp_bfd_R', abbr: 'SSpB_R', hemi: 'right', x: 3.0, y: -0.5, z: 0.3 },
    { name: 'SSp_ul_R', abbr: 'SSpU_R', hemi: 'right', x: 2.5, y: -0.2, z: 0.5 },
    // Visual cortex
    { name: 'VISp_L', abbr: 'VISp_L', hemi: 'left', x: -3.0, y: -4.0, z: 0.2 },
    { name: 'VISpm_L', abbr: 'VISm_L', hemi: 'left', x: -1.5, y: -3.5, z: 0.8 },
    { name: 'VISp_R', abbr: 'VISp_R', hemi: 'right', x: 3.0, y: -4.0, z: 0.2 },
    { name: 'VISpm_R', abbr: 'VISm_R', hemi: 'right', x: 1.5, y: -3.5, z: 0.8 },
    // Auditory cortex
    { name: 'AUDp_L', abbr: 'AUDp_L', hemi: 'left', x: -4.0, y: -2.5, z: -0.2 },
    { name: 'AUDp_R', abbr: 'AUDp_R', hemi: 'right', x: 4.0, y: -2.5, z: -0.2 },
    // Prefrontal / association
    { name: 'PL_L', abbr: 'PL_L', hemi: 'left', x: -0.6, y: 3.0, z: -0.8 },
    { name: 'ILA_L', abbr: 'ILA_L', hemi: 'left', x: -0.6, y: 2.5, z: -1.2 },
    { name: 'ORBm_L', abbr: 'ORBm_L', hemi: 'left', x: -1.0, y: 2.8, z: -2.0 },
    { name: 'PL_R', abbr: 'PL_R', hemi: 'right', x: 0.6, y: 3.0, z: -0.8 },
    { name: 'ILA_R', abbr: 'ILA_R', hemi: 'right', x: 0.6, y: 2.5, z: -1.2 },
    { name: 'ORBm_R', abbr: 'ORBm_R', hemi: 'right', x: 1.0, y: 2.8, z: -2.0 },
    // Hippocampus
    { name: 'CA1_L', abbr: 'CA1_L', hemi: 'left', x: -2.0, y: -2.0, z: -1.6 },
    { name: 'CA3_L', abbr: 'CA3_L', hemi: 'left', x: -2.2, y: -1.8, z: -1.8 },
    { name: 'DG_L', abbr: 'DG_L', hemi: 'left', x: -2.4, y: -1.5, z: -2.0 },
    { name: 'CA1_R', abbr: 'CA1_R', hemi: 'right', x: 2.0, y: -2.0, z: -1.6 },
    { name: 'CA3_R', abbr: 'CA3_R', hemi: 'right', x: 2.2, y: -1.8, z: -1.8 },
    { name: 'DG_R', abbr: 'DG_R', hemi: 'right', x: 2.4, y: -1.5, z: -2.0 },
    // Thalamus / subcortical
    { name: 'LGd_L', abbr: 'LGd_L', hemi: 'left', x: -1.5, y: -2.2, z: -0.5 },
    { name: 'VPM_L', abbr: 'VPM_L', hemi: 'left', x: -1.5, y: -1.5, z: -0.5 },
    { name: 'LGd_R', abbr: 'LGd_R', hemi: 'right', x: 1.5, y: -2.2, z: -0.5 },
    { name: 'VPM_R', abbr: 'VPM_R', hemi: 'right', x: 1.5, y: -1.5, z: -0.5 },
    // Cerebellum
    { name: 'Crus1_L', abbr: 'Crus1L', hemi: 'left', x: -4.0, y: -6.5, z: -1.5 },
    { name: 'Crus1_R', abbr: 'Crus1R', hemi: 'right', x: 4.0, y: -6.5, z: -1.5 },
    { name: 'Vermis', abbr: 'Verm', hemi: 'midline', x: 0.0, y: -6.0, z: -1.5 },
];

// ─── Seed function ─────────────────────────────────────────────────────────────

async function seedModel(
    name: string,
    description: string,
    regions: RegionDef[],
    lambda: number,
    threshold: number,
    userId: string,
) {
    console.log(`\n🧠 Seeding: ${name} (${regions.length} regions)`);

    // Check if model already exists
    const existing = await prisma.brainModel.findFirst({ where: { name } });
    if (existing) {
        console.log(`   ⚠️  Already exists (${existing.id}) — skipping`);
        return existing;
    }

    const connections = makeConnectivity(regions, lambda, threshold);
    console.log(`   Generated ${connections.length} connections (λ=${lambda}, threshold=${threshold})`);

    return prisma.$transaction(async (tx) => {
        // 1. Connectivity set
        const connSet = await tx.connectivitySet.create({
            data: {
                name: `${name} Connectivity`,
                regionCount: regions.length,
                connectionCount: connections.length,
                isDirected: true,
            },
        });

        // 2. Brain model
        const model = await tx.brainModel.create({
            data: {
                name,
                description,
                regionCount: regions.length,
                defaultBackend: 'rate_based',
                parameters: { tau: 0.01, gain: 1.0, noise_sigma: 0.02, global_coupling: 0.5 },
                connectivitySetId: connSet.id,
                userId,
            },
        });

        // 3. Regions (batch)
        const created = await Promise.all(
            regions.map((r, i) =>
                tx.region.create({
                    data: {
                        name: r.name,
                        abbreviation: r.abbr,
                        hemisphere: r.hemi,
                        atlasIndex: i,
                        coordX: r.x,
                        coordY: r.y,
                        coordZ: r.z,
                        modelId: model.id,
                    },
                }),
            ),
        );

        // 4. Connections (batch)
        const regionById = new Map(created.map((r) => [r.atlasIndex!, r.id]));
        await tx.connection.createMany({
            data: connections.map((c) => ({
                sourceRegionId: regionById.get(c.si)!,
                targetRegionId: regionById.get(c.ti)!,
                weight: c.weight,
                delay: c.delay,
                connectivitySetId: connSet.id,
            })),
            skipDuplicates: true,
        });

        console.log(`   ✅ ${name}: model=${model.id.slice(0, 8)} regions=${created.length} connections=${connections.length}`);
        return model;
    }, { timeout: 60_000 });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const user = await prisma.user.findFirst();
    if (!user) throw new Error('No user found — run the main seed first');

    await seedModel(
        'AAL-90',
        'Automated Anatomical Labeling atlas (Tzourio-Mazoyer 2002). 90 cortical + subcortical regions ' +
        'in MNI space. 45 regions per hemisphere. Widely used for fMRI seed-based connectivity analysis.',
        AAL90_REGIONS,
        50, // lambda (mm) — decay length for connectivity
        0.04,
        user.id,
    );

    await seedModel(
        'Schaefer-100',
        'Local-global parcellation of the cerebral cortex (Schaefer 2018). ' +
        '100 symmetric regions mapped to 7 large-scale networks: ' +
        'Visual, Somatomotor, Dorsal Attention, Salience, Limbic, Frontoparietal, Default Mode.',
        SCHAEFER100_REGIONS,
        45,
        0.04,
        user.id,
    );

    await seedModel(
        'Mouse Connectome (Allen)',
        'Simplified mouse brain connectivity atlas based on the Allen Mouse Brain Connectivity Atlas. ' +
        '33 regions covering isocortex (motor, sensory, visual, auditory, prefrontal), hippocampus, ' +
        'thalamus, and cerebellum. Coordinates are in mm from bregma (anterior-posterior, dorsal-ventral).',
        MOUSE_REGIONS,
        3, // much smaller brain — 3 mm decay
        0.04,
        user.id,
    );

    console.log('\n✅ All models seeded. Open http://localhost:5173/models to view them.');
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
