import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';

@Controller('admin')
export class AdminController {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  @Get('health')
  async health() {
    const checks: Record<string, string> = {};

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.postgres = 'ok';
    } catch {
      checks.postgres = 'error';
    }

    try {
      await this.redis.getClient().ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
    }

    const healthy = Object.values(checks).every((v) => v === 'ok');
    return {
      status: healthy ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    };
  }

  @Get('stats')
  async stats() {
    const [models, datasets, experiments, runs] = await Promise.all([
      this.prisma.brainModel.count(),
      this.prisma.dataset.count(),
      this.prisma.experiment.count(),
      this.prisma.experimentRun.count(),
    ]);

    return { models, datasets, experiments, runs };
  }
}
