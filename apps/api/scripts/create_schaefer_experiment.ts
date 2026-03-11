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

  const experiment = await prisma.experiment.create({
    data: {
      name: 'Schaefer 400 Resting State Simulation',
      description: 'Simulating large-scale resting-state functional connectivity dynamics using the empirical Schaefer 400-node cortical parcellation.',
      modelId: model.id,
      status: 'draft',
      config: {
        backend: 'rate_based',
        duration: 5.0,
        dt: 0.001,
        seed: 42,
        parameters: {
          tau: 0.015,
          gain: 1.2,
          noise_sigma: 0.02,
          global_coupling: 0.4,
        },
      },
      tags: ['resting-state', 'schaefer', 'rate-based', 'large-scale'],
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
