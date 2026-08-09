import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import type { CreateBrainModel, UpdateBrainModel } from '@brainforge/contracts';

/** Rows per createMany call during model import. */
const IMPORT_CHUNK_SIZE = 10_000;

@Injectable()
export class ModelsService {
  constructor(private prisma: PrismaService) { }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.brainModel.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { regions: true } } },
      }),
      this.prisma.brainModel.count(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const model = await this.prisma.brainModel.findUnique({
      where: { id },
      include: {
        regions: true,
        connectivitySet: true,
      },
    });
    if (!model) throw new NotFoundException(`Model ${id} not found`);
    return model;
  }

  async create(data: CreateBrainModel) {
    return this.prisma.brainModel.create({
      data: {
        name: data.name,
        description: data.description,
        defaultBackend: data.defaultBackend,
        parameters: data.parameters ?? undefined,
        regionCount: 0,
      },
    });
  }

  async importData(
    modelId: string,
    regions: Array<{
      name: string;
      abbreviation?: string;
      hemisphere?: string;
      atlasIndex?: number;
      coordX?: number;
      coordY?: number;
      coordZ?: number;
    }>,
    connections: Array<{
      sourceIndex: number;
      targetIndex: number;
      weight: number;
      delay?: number;
    }>,
  ) {
    const model = await this.findOne(modelId);

    // IDs are generated up front so regions can be inserted with createMany —
    // which does not return created rows — while still letting us map atlas
    // index to region id for the connection pass.
    const regionRows = regions.map((r, i) => ({
      id: randomUUID(),
      name: r.name,
      abbreviation: r.abbreviation,
      hemisphere: r.hemisphere,
      atlasIndex: r.atlasIndex ?? i,
      coordX: r.coordX,
      coordY: r.coordY,
      coordZ: r.coordZ,
      modelId,
    }));

    const regionByIndex = new Map(regionRows.map((r) => [r.atlasIndex, r.id]));
    const validConnections = connections.filter(
      (c) => regionByIndex.has(c.sourceIndex) && regionByIndex.has(c.targetIndex),
    );

    return this.prisma.$transaction(async (tx: any) => {
      // 1. Create a connectivity set
      const connSet = await tx.connectivitySet.create({
        data: {
          name: `${model.name} Connectivity`,
          regionCount: regions.length,
          connectionCount: validConnections.length,
          isDirected: true,
        },
      });

      // 2. Bulk-create regions
      for (let i = 0; i < regionRows.length; i += IMPORT_CHUNK_SIZE) {
        await tx.region.createMany({
          data: regionRows.slice(i, i + IMPORT_CHUNK_SIZE),
        });
      }

      // 3. Bulk-create connections (by atlas index)
      for (let i = 0; i < validConnections.length; i += IMPORT_CHUNK_SIZE) {
        const chunk = validConnections.slice(i, i + IMPORT_CHUNK_SIZE);
        await tx.connection.createMany({
          data: chunk.map((c) => ({
            sourceRegionId: regionByIndex.get(c.sourceIndex)!,
            targetRegionId: regionByIndex.get(c.targetIndex)!,
            weight: c.weight,
            delay: c.delay ?? 0,
            connectivitySetId: connSet.id,
          })),
          skipDuplicates: true,
        });
      }

      // 4. Update model metadata
      await tx.brainModel.update({
        where: { id: modelId },
        data: {
          regionCount: regionRows.length,
          connectivitySetId: connSet.id,
        },
      });

      return {
        modelId,
        regionsCreated: regionRows.length,
        connectionsCreated: validConnections.length,
        connectivitySetId: connSet.id,
      };
    }, { timeout: 120000, maxWait: 20000 });
  }

  async update(id: string, data: UpdateBrainModel) {
    await this.findOne(id);
    return this.prisma.brainModel.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.defaultBackend !== undefined && {
          defaultBackend: data.defaultBackend,
        }),
        ...(data.parameters !== undefined && { parameters: data.parameters }),
      },
    });
  }

  async delete(id: string) {
    await this.findOne(id);
    return this.prisma.brainModel.delete({ where: { id } });
  }

  async getRegions(modelId: string) {
    await this.findOne(modelId);
    return this.prisma.region.findMany({
      where: { modelId },
      orderBy: { atlasIndex: 'asc' },
    });
  }

  async getConnectivity(modelId: string) {
    const model = await this.findOne(modelId);
    if (!model.connectivitySetId) return [];
    return this.prisma.connection.findMany({
      where: { connectivitySetId: model.connectivitySetId },
      select: {
        sourceRegionId: true,
        targetRegionId: true,
        weight: true,
        delay: true,
        connectionType: true,
      },
    });
  }
}
