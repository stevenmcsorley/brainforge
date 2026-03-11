import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const model = await prisma.brainModel.findFirst({
    where: { name: 'Mouse Connectome (Allen)' },
    orderBy: { createdAt: 'desc' },
  });

  if (!model) {
    console.error('Could not find Mouse Connectome (Allen) model.');
    process.exit(1);
  }

  const experiment = await prisma.experiment.create({
    data: {
      name: '⚡ 10-Minute Intensive Training on Mouse Connectome',
      description: 'An extended 10-minute training session for Brain-Pong to observe significant empirical weight changes over a longer period of continuous dopamine stimuli.',
      modelId: model.id,
      status: 'draft',
      config: {
        backend: 'rate_based',
        duration: 600.0,
        dt: 0.001,
        seed: 888,
        reportInterval: 10,
        parameters: {
          tau: 0.01,
          gain: 1.0,
          noise_sigma: 0.1, // higher noise for exploration
          global_coupling: 0.5,
          plasticity_enabled: true,
          learning_rate: 0.05, // Faster learning rate for the mouse
        },
      },
      tags: ['plasticity', 'hebbian', 'learning', 'mouse', 'long'],
    },
  });

  console.log(`Created Experiment: ${experiment.name} (${experiment.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
