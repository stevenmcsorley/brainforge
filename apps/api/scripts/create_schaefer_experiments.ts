import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const model = await prisma.brainModel.findFirst({
    where: { name: 'Schaefer 400 Synthetic' },
    orderBy: { createdAt: 'desc' },
  });

  if (!model) {
    console.error('Could not find Schaefer 400 Synthetic model.');
    process.exit(1);
  }

  const experiments = [
    {
      name: '🌐 Global Synchronization (Seizure Dynamics)',
      description: 'High global coupling induces massive synchronized waves of neural activity across all 400 cortical regions. Watch how excitation propagates through the entire topology, mimicking a generalized seizure.',
      modelId: model.id,
      status: 'draft',
      config: {
        backend: 'rate_based',
        duration: 20.0,
        dt: 0.001,
        seed: 1337,
        parameters: {
          tau: 0.02,
          gain: 1.5,
          noise_sigma: 0.05,
          global_coupling: 1.5, // High coupling
        },
      },
      tags: ['seizure', 'synchronization', 'high-coupling', 'schaefer'],
    },
    {
      name: '🧠 Critical Edge of Chaos (Resting State)',
      description: 'Finely tuned macroscopic parameters near the critical transition point. The network exhibits complex, spontaneous, scale-free fluctuations typical of a healthy brain in a resting state.',
      modelId: model.id,
      status: 'draft',
      config: {
        backend: 'rate_based',
        duration: 30.0,
        dt: 0.001,
        seed: 4242,
        parameters: {
          tau: 0.015,
          gain: 1.0,
          noise_sigma: 0.08,
          global_coupling: 0.85, // Critical tuning
        },
      },
      tags: ['criticality', 'resting-state', 'chaos', 'schaefer'],
    },
    {
      name: '⚡ Synaptic Plasticity on 159k Connections',
      description: 'Unleash structural plasticity across the massive connectome. Oja\'s rule runs natively on the ODE solver, dynamically pruning and strengthening the network\'s 159,600 connections in real-time based on activity.',
      modelId: model.id,
      status: 'draft',
      config: {
        backend: 'rate_based',
        duration: 60.0,
        dt: 0.001,
        seed: 9999,
        parameters: {
          tau: 0.01,
          gain: 1.0,
          noise_sigma: 0.15, // Higher noise to drive plasticity
          global_coupling: 0.5,
          plasticity_enabled: true,
          learning_rate: 0.01,
          alpha: 1.0, // Homeostasis
        },
      },
      tags: ['plasticity', 'hebbian', 'learning', 'schaefer'],
    }
  ];

  for (const exp of experiments) {
    const created = await prisma.experiment.create({
      data: exp,
    });
    console.log(`Created Experiment: ${created.name} (${created.id})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
