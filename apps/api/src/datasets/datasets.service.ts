import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type { CreateDataset } from '@brainforge/contracts';

@Injectable()
export class DatasetsService {
  constructor(private prisma: PrismaService) { }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.dataset.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.dataset.count(),
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
    const dataset = await this.prisma.dataset.findUnique({ where: { id } });
    if (!dataset) throw new NotFoundException(`Dataset ${id} not found`);
    return dataset;
  }

  async create(data: CreateDataset) {
    return this.prisma.dataset.create({
      data: {
        name: data.name,
        description: data.description,
        format: data.format,
        source: data.source,
        metadata: (data.metadata ?? undefined) as any,
      },
    });
  }

  async delete(id: string) {
    await this.findOne(id);
    return this.prisma.dataset.delete({ where: { id } });
  }
}
