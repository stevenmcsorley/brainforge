import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type { CreateExperiment, UpdateExperiment } from '@brainforge/contracts';

@Injectable()
export class ExperimentsService {
  constructor(private prisma: PrismaService) { }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.experiment.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          model: { select: { id: true, name: true } },
          _count: { select: { runs: true } },
          // Include completed runs for the Compare Runs selector
          runs: {
            where: { status: 'completed' },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: { id: true, seed: true, status: true, totalSteps: true, createdAt: true },
          },
        },
      }),
      this.prisma.experiment.count(),
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
    const experiment = await this.prisma.experiment.findUnique({
      where: { id },
      include: {
        model: true,
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!experiment)
      throw new NotFoundException(`Experiment ${id} not found`);
    return experiment;
  }

  async create(data: CreateExperiment) {
    // Verify model exists
    const model = await this.prisma.brainModel.findUnique({
      where: { id: data.modelId },
    });
    if (!model)
      throw new NotFoundException(`Model ${data.modelId} not found`);

    return this.prisma.experiment.create({
      data: {
        name: data.name,
        description: data.description,
        modelId: data.modelId,
        config: data.config as any,
        tags: data.tags ?? [],
        status: 'draft',
      },
    });
  }

  async update(id: string, data: UpdateExperiment) {
    const experiment = await this.findOne(id);
    if (data.modelId && data.modelId !== experiment.modelId) {
      const model = await this.prisma.brainModel.findUnique({
        where: { id: data.modelId },
      });
      if (!model)
        throw new NotFoundException(`Model ${data.modelId} not found`);
    }

    return this.prisma.experiment.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.modelId && { modelId: data.modelId }),
        ...(data.config && { config: data.config as any }),
        ...(data.tags && { tags: data.tags }),
        ...(data.status && { status: data.status }),
      },
    });
  }

  async delete(id: string) {
    await this.findOne(id);
    // ExperimentRun has no onDelete: Cascade on its experiment relation, so the
    // runs (and their cascading metrics, events and artifacts) must go first or
    // the delete fails on a foreign key violation.
    return this.prisma.$transaction(async (tx: any) => {
      await tx.experimentRun.deleteMany({ where: { experimentId: id } });
      return tx.experiment.delete({ where: { id } });
    });
  }
}
