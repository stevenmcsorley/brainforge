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

  const experiments = [
    {
      name: '⚡ Synaptic Plasticity on Mouse Connectome',
      description: 'Test Hebbian learning and Dopamine reward on the compact 33-region Allen mouse connectome. A great fast-learning model for Brain-Pong.',
      modelId: model.id,
      status: 'draft',
      config: {
        backend: 'rate_based',
        duration: 120.0,
        dt: 0.001,
        seed: 777,
        reportInterval: 10,
        parameters: {
          tau: 0.01,
          gain: 1.0,
          noise_sigma: 0.1,
          global_coupling: 0.5,
          plasticity_enabled: true,
          learning_rate: 0.05,
        },
        environment: {
          type: 'pong',
          sensoryNodes: [1],
          motorNodes: [30]
        }
      },
      tags: ['plasticity', 'hebbian', 'learning', 'mouse', 'pong'],
    },
    {
      name: '🤖 Braitenberg Cybernetics (Fear & Love)',
      description: 'A 2D cybernetic vehicle controlled by the Mouse connectome. Two light sensors map to nodes 5 & 6, and two wheels map to nodes 30 & 31.',
      modelId: model.id,
      status: 'draft',
      config: {
        backend: 'rate_based',
        duration: 300.0,
        dt: 0.001,
        seed: 1212,
        reportInterval: 10,
        parameters: {
          tau: 0.01,
          gain: 1.0,
          noise_sigma: 0.1,
          global_coupling: 0.4,
          plasticity_enabled: true,
          learning_rate: 0.05,
        },
        environment: {
          type: 'braitenberg',
          sensoryNodes: [5, 6],
          motorNodes: [30, 31]
        }
      },
      tags: ['cybernetics', 'braitenberg', 'robotics', 'mouse'],
    },
    {
      name: '⚖️ CartPole Balancing Act',
      description: 'The classic ML benchmark. The brain receives 4 state variables (position, velocity, angle, angular velocity) into its distinct sensory cortices and must learn to balance the pole by outputting lateral force.',
      modelId: model.id,
      status: 'draft',
      config: {
        backend: 'rate_based',
        duration: 300.0,
        dt: 0.001,
        seed: 4242,
        reportInterval: 10,
        parameters: {
          tau: 0.01,
          gain: 1.0,
          noise_sigma: 0.08,
          global_coupling: 0.5,
          plasticity_enabled: true,
          learning_rate: 0.05,
        },
        environment: {
          type: 'cartpole',
          sensoryNodes: [1, 2, 3, 4],
          motorNodes: [32]
        }
      },
      tags: ['reinforcement-learning', 'cartpole', 'control', 'mouse'],
    }
  ];

  for (const exp of experiments) {
    const created = await prisma.experiment.create({ data: exp as any });
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
