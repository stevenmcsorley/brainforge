import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed the database with a sample brain model based on a simplified
 * Desikan-Killiany atlas (68 cortical regions).
 * Connectivity weights are synthetic but structurally plausible —
 * they follow a distance-dependent falloff with some long-range connections.
 */
async function main() {
  console.log('[Seed] Starting database seed...');

  // Create dev user
  const user = await prisma.user.upsert({
    where: { email: 'dev@brainforge.local' },
    update: {},
    create: {
      name: 'Dev User',
      email: 'dev@brainforge.local',
    },
  });

  // Sample regions (simplified Desikan-Killiany-like, 34 per hemisphere)
  const regionNames = [
    'bankssts', 'caudalanteriorcingulate', 'caudalmiddlefrontal',
    'cuneus', 'entorhinal', 'fusiform', 'inferiorparietal',
    'inferiortemporal', 'isthmuscingulate', 'lateraloccipital',
    'lateralorbitofrontal', 'lingual', 'medialorbitofrontal',
    'middletemporal', 'parahippocampal', 'paracentral',
    'parsopercularis', 'parsorbitalis', 'parstriangularis',
    'pericalcarine', 'postcentral', 'posteriorcingulate',
    'precentral', 'precuneus', 'rostralanteriorcingulate',
    'rostralmiddlefrontal', 'superiorfrontal', 'superiorparietal',
    'superiortemporal', 'supramarginal', 'frontalpole',
    'temporalpole', 'transversetemporal', 'insula',
  ];

  // Create brain model
  let model = await prisma.brainModel.findFirst({
    where: { name: 'DK68 Sample Model' },
  });

  if (model) {
    console.log(`\n🧠 Seeding: DK68 Sample Model (68 regions)\n   ⚠️  Already exists (${model.id}) — skipping`);
    return;
  }

  model = await prisma.brainModel.create({
    data: {
      name: 'DK68 Sample Model',
      description:
        'A 68-region cortical model based on a simplified Desikan-Killiany atlas. ' +
        'Connectivity weights are synthetic, generated with distance-dependent falloff.',
      version: '1.0.0',
      regionCount: 68,
      defaultBackend: 'rate_based',
      parameters: {
        tau: 0.01,
        gain: 1.0,
        noise_sigma: 0.02,
        global_coupling: 0.5,
      },
      userId: user.id,
    },
  });

  // Create connectivity set
  const connectivitySet = await prisma.connectivitySet.create({
    data: {
      name: 'DK68 Synthetic Connectivity',
      description:
        'Synthetic structural connectivity for 68 cortical regions. ' +
        'Weights generated with distance-dependent decay and random long-range projections.',
      regionCount: 68,
      connectionCount: 0, // will update after creating connections
      isDirected: true,
    },
  });

  // Link model to connectivity set
  await prisma.brainModel.update({
    where: { id: model.id },
    data: { connectivitySetId: connectivitySet.id },
  });

  // Generate 3D coordinates (approximate cortical surface positions)
  // Using a simple ellipsoid model: left hemisphere x<0, right x>0
  function regionCoords(index: number, hemisphere: 'left' | 'right') {
    const t = (index / 34) * Math.PI * 2;
    const phi = (index / 34) * Math.PI;
    const sign = hemisphere === 'left' ? -1 : 1;
    return {
      x: sign * (30 + 15 * Math.sin(phi)),
      y: 40 * Math.cos(t) + (Math.random() - 0.5) * 10,
      z: 30 * Math.sin(t) * Math.cos(phi) + (Math.random() - 0.5) * 10,
    };
  }

  // Create regions for both hemispheres
  const regions: Array<{ id: string; name: string; coords: { x: number; y: number; z: number } }> = [];

  for (const hemisphere of ['left', 'right'] as const) {
    for (let i = 0; i < regionNames.length; i++) {
      const coords = regionCoords(i, hemisphere);
      const prefix = hemisphere === 'left' ? 'lh' : 'rh';
      const region = await prisma.region.create({
        data: {
          name: `${prefix}_${regionNames[i]}`,
          abbreviation: `${prefix}_${regionNames[i].slice(0, 4)}`,
          hemisphere,
          atlasIndex: hemisphere === 'left' ? i : i + 34,
          coordX: coords.x,
          coordY: coords.y,
          coordZ: coords.z,
          modelId: model.id,
        },
      });
      regions.push({ id: region.id, name: region.name, coords });
    }
  }

  // Generate connectivity with distance-dependent weights
  let connectionCount = 0;
  const connections: Array<{
    sourceRegionId: string;
    targetRegionId: string;
    connectivitySetId: string;
    weight: number;
    delay: number;
    connectionType: string;
  }> = [];

  for (let i = 0; i < regions.length; i++) {
    for (let j = 0; j < regions.length; j++) {
      if (i === j) continue;

      const dx = regions[i].coords.x - regions[j].coords.x;
      const dy = regions[i].coords.y - regions[j].coords.y;
      const dz = regions[i].coords.z - regions[j].coords.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Distance-dependent probability and weight
      const connectionProb = Math.exp(-distance / 40);
      // Add some random long-range connections
      const hasConnection =
        Math.random() < connectionProb || Math.random() < 0.02;

      if (hasConnection) {
        const weight = Math.max(
          0.01,
          Math.exp(-distance / 60) * (0.5 + Math.random() * 0.5),
        );
        // Delay proportional to distance (simple conduction model)
        const delay = distance * 0.1;

        connections.push({
          sourceRegionId: regions[i].id,
          targetRegionId: regions[j].id,
          connectivitySetId: connectivitySet.id,
          weight: Math.round(weight * 1000) / 1000,
          delay: Math.round(delay * 100) / 100,
          connectionType: Math.random() < 0.8 ? 'excitatory' : 'inhibitory',
        });
        connectionCount++;
      }
    }
  }

  // Batch insert connections
  await prisma.connection.createMany({ data: connections });

  // Update connection count
  await prisma.connectivitySet.update({
    where: { id: connectivitySet.id },
    data: { connectionCount },
  });

  // Create sample dataset record
  await prisma.dataset.create({
    data: {
      name: 'DK68 Synthetic Dataset',
      description:
        'Synthetic connectivity and region data for a 68-region cortical model.',
      format: 'connectivity_matrix',
      source: 'brainforge-seed-generator',
      regionCount: 68,
      userId: user.id,
    },
  });

  // Create a sample experiment
  await prisma.experiment.create({
    data: {
      name: 'Baseline Rate Dynamics',
      description:
        'Baseline simulation of rate-based dynamics across the DK68 model with default parameters.',
      modelId: model.id,
      status: 'draft',
      config: {
        backend: 'rate_based',
        duration: 2.0,
        dt: 0.001,
        seed: 42,
        parameters: {
          tau: 0.01,
          gain: 1.0,
          noise_sigma: 0.02,
          global_coupling: 0.5,
        },
      },
      tags: ['baseline', 'rate-based', 'dk68'],
      userId: user.id,
    },
  });

  // Create a simulation preset
  await prisma.simulationPreset.upsert({
    where: { name: 'Quick Rate Test' },
    update: {},
    create: {
      name: 'Quick Rate Test',
      description: 'Fast rate-based simulation for testing (0.5s, dt=0.001)',
      backend: 'rate_based',
      config: {
        duration: 0.5,
        dt: 0.001,
        seed: 42,
        reportInterval: 10,
        parameters: {
          tau: 0.01,
          gain: 1.0,
          noise_sigma: 0.02,
          global_coupling: 0.5,
        },
      },
    },
  });

  console.log(`[Seed] Created model: ${model.name} (${model.id})`);
  console.log(`[Seed] Created ${regions.length} regions`);
  console.log(`[Seed] Created ${connectionCount} connections`);
  console.log('[Seed] Database seeded successfully.');
}

main()
  .catch((e) => {
    console.error('[Seed] Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
