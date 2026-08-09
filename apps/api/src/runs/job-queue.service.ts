import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisService } from '../common/redis.service';

export interface SimulationJobData {
  runId: string;
  experimentId: string;
  modelId: string;
  config: Record<string, unknown>;
  seed: number;
}

@Injectable()
export class JobQueueService implements OnModuleDestroy {
  private queue: Queue;

  constructor(private redis: RedisService) {
    // BullMQ bundles its own ioredis internally which conflicts with the root
    // ioredis package at the type level. Pass a connection config object instead
    // of a pre-existing client to avoid the type mismatch.
    const opts = this.redis.getClient().options;
    this.queue = new Queue('simulation', {
      connection: {
        host: opts.host ?? 'localhost',
        port: opts.port ?? 6379,
        password: opts.password,
        db: (opts as any).db ?? 0,
      },
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
  }

  async enqueueSimulation(data: SimulationJobData): Promise<string> {
    const job = await this.queue.add('run-simulation', data, {
      jobId: data.runId,
    });
    return job.id!;
  }

  /**
   * Remove a job that has not started yet. Returns false if the job is already
   * active (the worker owns it at that point and must stop via pub/sub) or gone.
   */
  async removeIfPending(jobId: string): Promise<boolean> {
    try {
      const job = await this.queue.getJob(jobId);
      if (!job) return false;

      const state = await job.getState();
      if (state !== 'waiting' && state !== 'delayed') return false;

      await job.remove();
      return true;
    } catch (err) {
      // Best-effort: the cancel flag is the authoritative stop signal.
      console.error(`[JobQueue] Failed to remove job ${jobId}:`, err);
      return false;
    }
  }

  async getJobStatus(jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;
    const state = await job.getState();
    return { id: job.id, state, progress: job.progress, data: job.data };
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
