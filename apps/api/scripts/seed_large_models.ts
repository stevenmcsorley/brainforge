import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as readline from 'readline';

const prisma = new PrismaClient();

async function parseCoords(filePath: string) {
  const regions = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let i = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const parts = line.split(',');
    regions.push({
      name: parts[0],
      coordX: parseFloat(parts[1]),
      coordY: parseFloat(parts[2]),
      coordZ: parseFloat(parts[3]),
      hemisphere: parts[4].trim(),
      atlasIndex: i++,
    });
  }
  return regions;
}

async function main() {
  console.log('--- Database Large Model Seeder ---');

  const name = 'Schaefer 1000 Synthetic';
  const description = 'Advanced 1000-region cortical parcellation (Schaefer et al. 2018) with synthetic small-world connectivity based on MNI coordinates.';
  
  // 1. Check if it already exists
  const existing = await prisma.brainModel.findFirst({ where: { name } });
  if (existing) {
    console.log(`[Seed] Model "${name}" already exists (${existing.id}). Skipping.`);
    return;
  }

  // 2. Create the core model
  const model = await prisma.brainModel.create({
    data: {
      name,
      description,
      defaultBackend: 'rate_based',
      parameters: {
        tau: 0.01, gain: 1.0, noise_sigma: 0.02, global_coupling: 0.5
      },
      regionCount: 1000,
    },
  });

  // 3. Create the connectivity set
  const connSet = await prisma.connectivitySet.create({
    data: {
      name: `${model.name} Connectivity`,
      regionCount: 1000,
      connectionCount: 0, 
      isDirected: true,
    },
  });

  // 4. Parse & Upload Regions
  const coordsPath = '../../python/datasets/advanced_connectome/coords.csv';
  const regions = await parseCoords(coordsPath);
  
  await prisma.region.createMany({
    data: regions.map(r => ({
      ...r,
      modelId: model.id,
    }))
  });

  const createdRegions = await prisma.region.findMany({
    where: { modelId: model.id },
    orderBy: { atlasIndex: 'asc' },
  });

  const regionByIndex = new Map(createdRegions.map(r => [r.atlasIndex!, r.id]));

  // 5. Parse & Stream Upload Connections
  const weightsPath = '../../python/datasets/advanced_connectome/weights.csv';
  const fileStream = fs.createReadStream(weightsPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let connectionsBuffer = [];
  let totalConnections = 0;
  let sourceIndex = 0;

  console.log(`[Seed] Processing 1M connections from ${weightsPath}...`);

  for await (const line of rl) {
    if (!line.trim()) continue;
    const weights = line.split(',');
    for (let targetIndex = 0; targetIndex < weights.length; targetIndex++) {
      const w = parseFloat(weights[targetIndex]);
      if (w > 0) {
        connectionsBuffer.push({
          sourceRegionId: regionByIndex.get(sourceIndex)!,
          targetRegionId: regionByIndex.get(targetIndex)!,
          weight: w,
          delay: 0,
          connectivitySetId: connSet.id,
        });
      }
    }
    sourceIndex++;

    if (connectionsBuffer.length >= 10000) {
      await prisma.connection.createMany({ data: connectionsBuffer, skipDuplicates: true });
      totalConnections += connectionsBuffer.length;
      connectionsBuffer = [];
      process.stdout.write(`\r  Inserted ${totalConnections} edges...`);
    }
  }

  // Flush remaining
  if (connectionsBuffer.length > 0) {
    await prisma.connection.createMany({ data: connectionsBuffer, skipDuplicates: true });
    totalConnections += connectionsBuffer.length;
  }

  console.log(`\n[Seed] ✅ Success. Created ${totalConnections} total connections.`);

  // 6. Update references
  await prisma.brainModel.update({
    where: { id: model.id },
    data: { connectivitySetId: connSet.id },
  });
  
  await prisma.connectivitySet.update({
    where: { id: connSet.id },
    data: { connectionCount: totalConnections },
  });

  console.log(`[Seed] Done seeding ${name}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
