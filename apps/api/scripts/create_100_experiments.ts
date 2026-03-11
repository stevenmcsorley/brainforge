import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Models map we extracted from earlier
const MODELS = {
  DK68: '0037450e-fc89-449c-adda-b5d1fb1ad627',      // DK68 Sample Model
  AAL90: '81edb731-8ee9-4001-affc-2e8748bcc75f',     // AAL-90
  MOUSE: '8417a158-dc0a-476b-be5e-3db4e294f61e',     // Mouse Connectome (Allen)
  SCHAEFER400: 'd41ce273-674f-4018-ae83-29644793a19b',// Schaefer 400 Synthetic
  SCHAEFER1000: 'fb7489b7-0f99-40d9-84ca-3f77776ee172' // Schaefer 1000 Synthetic
};

export async function main() {
  console.log('[Seed] Generating 100+ Mind-Blowing BrainForge Experiments...');
  const experiments = [];

  // ─── 1. Bizarre & Chaotic Dynamics (High Noise, Unstable) ───
  for (let i = 1; i <= 20; i++) {
    experiments.push({
      name: `🌀 Edge of Chaos #${i}: ${['DK68', 'AAL90', 'SCHAEFER400', 'SCHAEFER1000', 'MOUSE'][i % 5]}`,
      description: 'Pushing the global coupling parameter just beyond the bifurcation point into high-amplitude chaotic attractors.',
      modelId: Object.values(MODELS)[i % 5],
      status: 'draft',
      config: {
        backend: 'rate_based',
        duration: 30.0 + (i * 0.5),
        dt: 0.001,
        seed: 1000 + i,
        reportInterval: 10,
        parameters: {
          tau: 0.01 + (i * 0.001),
          gain: 1.5 + (i * 0.05), // High gain triggers chaos
          noise_sigma: 0.5 + (i * 0.02), // High noise floor
          global_coupling: 0.8 + (i * 0.01),
          plasticity_enabled: false,
        }
      },
      tags: ['chaos', 'unstable', 'bifurcation'],
    });
  }

  // ─── 2. Extreme Neuroplasticity (Hebbian Overdrive) ───
  for (let i = 1; i <= 20; i++) {
    experiments.push({
      name: `🧠 Hyper-Plasticity Burst #${i}: ${['DK68', 'AAL90', 'SCHAEFER400', 'SCHAEFER1000', 'MOUSE'][i % 5]}`,
      description: 'Observation of Hebbian runaway dynamics. Learning rate is set extremely high, watching the connectome re-wire itself in seconds causing macro-scale seizure-like synchronization.',
      modelId: Object.values(MODELS)[i % 5],
      status: 'draft',
      config: {
        backend: 'rate_based',
        duration: 60.0,
        dt: 0.001,
        seed: 2000 + i,
        reportInterval: 20,
        parameters: {
          tau: 0.01,
          gain: 1.0,
          noise_sigma: 0.05,
          global_coupling: 0.4,
          plasticity_enabled: true,
          learning_rate: 0.5 + (i * 0.1), // Extreme scaling
        }
      },
      tags: ['plasticity', 'hebbian', 'rapid-learning'],
    });
  }

  // ─── 3. Depressed / Low Arousal States (Slow waves) ───
  for (let i = 1; i <= 20; i++) {
    experiments.push({
      name: `💤 Deep Slow-Wave Sleep #${i}: ${['DK68', 'AAL90', 'SCHAEFER400', 'SCHAEFER1000', 'MOUSE'][i % 5]}`,
      description: 'Simulating Deep Non-REM Delta-wave sleep. Global coupling is high but gain is exceptionally low, requiring massive integration to fire.',
      modelId: Object.values(MODELS)[i % 5],
      status: 'draft',
      config: {
        backend: 'rate_based',
        duration: 120.0,
        dt: 0.002,
        seed: 3000 + i,
        reportInterval: 50,
        parameters: {
          tau: 0.05, // Slow membrane time constant
          gain: 0.3, // Suppressed firing rates
          noise_sigma: 0.01,
          global_coupling: 1.2, // Strong synchronization
          plasticity_enabled: false,
        }
      },
      tags: ['sleep', 'delta-waves', 'slow-arousal'],
    });
  }

  // ─── 4. Sensory Deprivation / Isolation (Decoupled Nodes) ───
  for (let i = 1; i <= 20; i++) {
    experiments.push({
      name: `🔕 Total Sensory Isolation #${i}: ${['DK68', 'AAL90', 'SCHAEFER400', 'SCHAEFER1000', 'MOUSE'][i % 5]}`,
      description: 'Zero global coupling means the connectome is functionally silenced. Each brain region fires entirely independently driven only by absolute thermal noise.',
      modelId: Object.values(MODELS)[i % 5],
      status: 'draft',
      config: {
        backend: 'rate_based',
        duration: 30.0,
        dt: 0.001,
        seed: 4000 + i,
        reportInterval: 10,
        parameters: {
          tau: 0.01,
          gain: 1.0,
          noise_sigma: 0.2, // Noticeable noise
          global_coupling: 0.0, // NO COUPLING
          plasticity_enabled: false,
        }
      },
      tags: ['isolation', 'decoupled', 'noise-driven'],
    });
  }

  // ─── 5. Cybernetic Embodiments (Interactive) ───
  const interactiveTypes = ['pong', 'cartpole', 'braitenberg'];
  for (let i = 1; i <= 25; i++) {
    const envType = interactiveTypes[i % 3];
    const modelKey = Object.keys(MODELS)[i % 5];
    const modelId = MODELS[modelKey as keyof typeof MODELS];
    
    let envConfig: any = { type: envType };
    // Provide sensible random nodes dependent on model scale
    const regionCount = [68, 90, 400, 1000, 33][i % 5];
    
    if (envType === 'pong') {
      envConfig.sensoryNodes = [Math.floor(regionCount * 0.1)];
      envConfig.motorNodes = [Math.floor(regionCount * 0.9)];
    } else if (envType === 'cartpole') {
      envConfig.sensoryNodes = [
        Math.floor(regionCount * 0.1), Math.floor(regionCount * 0.2), 
        Math.floor(regionCount * 0.3), Math.floor(regionCount * 0.4)
      ];
      envConfig.motorNodes = [Math.floor(regionCount * 0.8)];
    } else if (envType === 'braitenberg') {
      envConfig.sensoryNodes = [Math.floor(regionCount * 0.3), Math.floor(regionCount * 0.7)];
      envConfig.motorNodes = [Math.floor(regionCount * 0.4), Math.floor(regionCount * 0.6)];
    }

    experiments.push({
      name: `🎮 ${envType.toUpperCase()} Embodiment #${i} (${modelKey})`,
      description: `Testing if biological topologies scaled to ${regionCount} regions can actively master the ${envType} environment in real-time.`,
      modelId: modelId,
      status: 'draft',
      config: {
        backend: 'rate_based',
        duration: 200.0,
        dt: 0.001,
        seed: 5000 + i,
        reportInterval: 10,
        parameters: {
          tau: 0.01,
          gain: 1.0,
          noise_sigma: 0.05,
          global_coupling: 0.5,
          plasticity_enabled: true,
          learning_rate: 0.05, // Required for game learning
        },
        environment: envConfig
      },
      tags: ['interactive', envType, 'cybernetics', 'RL'],
    });
  }

  // Filter out any models that might not have seeded correctly due to partial resets
  const existingModels = await prisma.brainModel.findMany({ select: { id: true, name: true } });
  const validModelIds = new Set(existingModels.map(m => m.id));
  const validExperiments = experiments.filter(e => validModelIds.has(e.modelId));

  console.log(`[Seed] Generated ${validExperiments.length} highly diverse experiments. Pushing to DB...`);

  let count = 0;
  for (const exp of validExperiments) {
    await prisma.experiment.create({ data: exp as any });
    count++;
  }

  console.log(`[Seed] ✅ Successfully created ${count} esoteric experiments.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
