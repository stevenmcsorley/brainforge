import { Injectable } from '@nestjs/common';
import { RedisService } from '../common/redis.service';
import { TELEMETRY_CHANNELS } from '@brainforge/config';

interface RunSubscription {
  /** Number of connected clients currently watching this run. */
  refCount: number;
  unsubscribe: () => Promise<void>;
}

@Injectable()
export class TelemetryService {
  private subscriptions = new Map<string, RunSubscription>();

  constructor(private redis: RedisService) {}

  /**
   * Subscribe to a run's telemetry channel. The Redis subscription is shared
   * across all clients watching the run and torn down when the last one leaves.
   */
  async subscribeToRun(
    runId: string,
    callback: (event: string) => void,
  ): Promise<void> {
    const existing = this.subscriptions.get(runId);
    if (existing) {
      existing.refCount += 1;
      return;
    }

    const channel = TELEMETRY_CHANNELS.runEvents(runId);
    const unsubscribe = await this.redis.subscribe(channel, callback);
    this.subscriptions.set(runId, { refCount: 1, unsubscribe });
  }

  /** Release one client's interest in a run, unsubscribing when it hits zero. */
  async unsubscribeFromRun(runId: string): Promise<void> {
    const sub = this.subscriptions.get(runId);
    if (!sub) return;

    sub.refCount -= 1;
    if (sub.refCount <= 0) {
      this.subscriptions.delete(runId);
      await sub.unsubscribe();
    }
  }
}
