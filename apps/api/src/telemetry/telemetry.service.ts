import { Injectable } from '@nestjs/common';
import { RedisService } from '../common/redis.service';
import { PrismaService } from '../common/prisma.service';
import { TELEMETRY_CHANNELS } from '@brainforge/config';

@Injectable()
export class TelemetryService {
  private subscriptions = new Map<string, boolean>();

  constructor(
    private redis: RedisService,
    private prisma: PrismaService,
  ) {}

  async subscribeToRun(
    runId: string,
    callback: (event: string) => void,
  ): Promise<void> {
    if (this.subscriptions.has(runId)) return;

    const channel = TELEMETRY_CHANNELS.runEvents(runId);
    this.subscriptions.set(runId, true);
    await this.redis.subscribe(channel, callback);
  }

  async persistMetric(
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

  async persistEvent(runId: string, type: string, payload: unknown) {
    return this.prisma.runEvent.create({
      data: {
        runId,
        type,
        payload: payload as any,
      },
    });
  }
}
