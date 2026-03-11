import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import { JobQueueService } from './job-queue.service';
import { TELEMETRY_CHANNELS } from '@brainforge/config';

@Injectable()
export class RunsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private jobQueue: JobQueueService,
  ) { }

  async findByExperiment(experimentId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.experimentRun.findMany({
        where: { experimentId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.experimentRun.count({ where: { experimentId } }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const run = await this.prisma.experimentRun.findUnique({
      where: { id },
      include: {
        experiment: { include: { model: true } },
        artifacts: true,
      },
    });
    if (!run) throw new NotFoundException(`Run ${id} not found`);
    return run;
  }

  async startRun(experimentId: string, seed?: number) {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId },
      include: { model: true },
    });
    if (!experiment)
      throw new NotFoundException(`Experiment ${experimentId} not found`);

    const config = experiment.config as Record<string, any>;
    const dt = config.dt || 0.001;
    const duration = config.duration || 1.0;
    const totalSteps = Math.ceil(duration / dt);
    const runSeed = seed ?? config.seed ?? Math.floor(Math.random() * 100000);

    const run = await this.prisma.experimentRun.create({
      data: {
        experimentId,
        status: 'queued',
        totalSteps,
        seed: runSeed,
      },
    });

    // Update experiment status
    await this.prisma.experiment.update({
      where: { id: experimentId },
      data: { status: 'running' },
    });

    // Enqueue the simulation job
    await this.jobQueue.enqueueSimulation({
      runId: run.id,
      experimentId,
      modelId: experiment.modelId,
      config,
      seed: runSeed,
    });

    return run;
  }

  async sendCommand(
    runId: string,
    command: 'pause' | 'resume' | 'stop' | Record<string, any>,
  ) {
    const run = await this.findOne(runId);

    if (command === 'pause' && run.status !== 'running') {
      throw new BadRequestException('Can only pause a running simulation');
    }
    if (command === 'resume' && run.status !== 'paused') {
      throw new BadRequestException('Can only resume a paused simulation');
    }

    const channel = TELEMETRY_CHANNELS.runEvents(runId);
    await this.redis.publish(
      channel,
      JSON.stringify({
        type: 'run_command',
        runId,
        command,
        timestamp: Date.now(),
      }),
    );

    if (command === 'stop') {
      await this.prisma.experimentRun.update({
        where: { id: runId },
        data: { status: 'cancelled' },
      });
    } else if (command === 'pause') {
      await this.prisma.experimentRun.update({
        where: { id: runId },
        data: { status: 'paused' },
      });
    } else if (command === 'resume') {
      await this.prisma.experimentRun.update({
        where: { id: runId },
        data: { status: 'running' },
      });
    }

    return { runId, command, sent: true };
  }

  async updateRunStatus(
    runId: string,
    status: string,
    extra?: { progress?: number; currentStep?: number; error?: string },
  ) {
    const run = await this.prisma.experimentRun.update({
      where: { id: runId },
      data: {
        status,
        ...(extra?.progress !== undefined && { progress: extra.progress }),
        ...(extra?.currentStep !== undefined && {
          currentStep: extra.currentStep,
        }),
        ...(extra?.error !== undefined && { error: extra.error }),
        ...(status === 'running' && { startedAt: new Date() }),
        ...(status === 'completed' && { completedAt: new Date(), progress: 1.0 }),
        ...(status === 'failed' && { completedAt: new Date() }),
        ...(status === 'cancelled' && { completedAt: new Date() }),
      },
    });

    // When a run reaches a terminal state, roll up to the experiment status
    const terminalStates = ['completed', 'failed', 'cancelled'];
    if (terminalStates.includes(status)) {
      const allRuns = await this.prisma.experimentRun.findMany({
        where: { experimentId: run.experimentId },
        select: { status: true },
      });
      const allDone = allRuns.every((r: { status: string }) => terminalStates.includes(r.status));
      if (allDone) {
        const anyFailed = allRuns.some((r: { status: string }) => r.status === 'failed');
        await this.prisma.experiment.update({
          where: { id: run.experimentId },
          data: { status: anyFailed ? 'failed' : 'completed' },
        });
      }
    }

    return run;
  }

  async saveRunMetric(
    runId: string,
    step: number,
    timestamp: number,
    metrics: Record<string, number>,
  ) {
    return this.prisma.runMetric.create({
      data: {
        runId,
        step,
        timestamp,
        metrics,
      },
    });
  }

  async saveRunEvent(
    runId: string,
    type: string,
    payload: Record<string, unknown>,
  ) {
    return this.prisma.runEvent.create({
      // Prisma requires InputJsonValue - cast through unknown to satisfy the type
      data: { runId, type, payload: payload as any },
    });
  }

  async getRunMetrics(runId: string, startStep?: number, endStep?: number) {
    const where: any = { runId };
    if (startStep !== undefined) where.step = { ...where.step, gte: startStep };
    if (endStep !== undefined) where.step = { ...where.step, lte: endStep };
    return this.prisma.runMetric.findMany({
      where,
      orderBy: { step: 'asc' },
    });
  }

  async getRunArtifacts(runId: string) {
    return this.prisma.runArtifact.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async compareRuns(runIds: string[]) {
    const runs = await this.prisma.experimentRun.findMany({
      where: { id: { in: runIds } },
      include: {
        experiment: { select: { name: true, config: true } },
      },
    });

    const metrics = await Promise.all(
      runIds.map((id) =>
        this.prisma.runMetric.findMany({
          where: { runId: id },
          orderBy: { step: 'asc' },
        }),
      ),
    );

    return {
      runs,
      metrics: Object.fromEntries(runIds.map((id, i) => [id, metrics[i]])),
    };
  }

  async saveActivityMap(runId: string, activityMap: Record<string, unknown>) {
    const run = await this.prisma.experimentRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException(`Run ${runId} not found`);
    const existing = (run.metadata ?? {}) as Record<string, unknown>;
    return this.prisma.experimentRun.update({
      where: { id: runId },
      data: { metadata: { ...existing, activityMap } as any },
    });
  }

  async getActivityMap(runId: string) {
    const run = await this.prisma.experimentRun.findUnique({
      where: { id: runId },
      include: { experiment: { include: { model: { include: { regions: { orderBy: { atlasIndex: 'asc' } } } } } } },
    });
    if (!run) throw new NotFoundException(`Run ${runId} not found`);

    const metadata = (run.metadata ?? {}) as Record<string, unknown>;
    const activityMap = metadata.activityMap as Record<string, number[]> | undefined;
    const regions = run.experiment.model.regions;

    return {
      runId,
      experimentName: run.experiment.name,
      modelName: run.experiment.model.name,
      hasData: !!activityMap,
      activityMap: activityMap ?? null,
      regions: regions.map((r: any, i: number) => ({
        id: r.id,
        name: r.name,
        abbreviation: r.abbreviation,
        hemisphere: r.hemisphere,
        atlasIndex: r.atlasIndex ?? i,
        coordX: r.coordX,
        coordY: r.coordY,
        coordZ: r.coordZ,
        meanActivity: activityMap?.regionMean?.[i] ?? null,
        maxActivity: activityMap?.regionMax?.[i] ?? null,
        stdActivity: activityMap?.regionStd?.[i] ?? null,
        finalActivity: activityMap?.finalState?.[i] ?? null,
      })),
    };
  }
}
