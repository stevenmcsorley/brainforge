import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client: Redis;
  private subscriber: Redis;

  /**
   * Per-channel callback sets. A single `message` listener on the shared
   * subscriber connection dispatches into these, so subscribing to N channels
   * costs one listener rather than N.
   */
  private channelHandlers = new Map<string, Set<(message: string) => void>>();

  constructor() {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = new Redis(url);
    this.subscriber = new Redis(url);

    this.subscriber.on('message', (channel, message) => {
      const handlers = this.channelHandlers.get(channel);
      if (!handlers) return;
      for (const handler of handlers) {
        try {
          handler(message);
        } catch (err) {
          console.error(`[Redis] Handler failed for ${channel}:`, err);
        }
      }
    });
  }

  getClient(): Redis {
    return this.client;
  }

  getSubscriber(): Redis {
    return this.subscriber;
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.client.publish(channel, message);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * Subscribe to a channel. Returns an unsubscribe function that removes this
   * callback and drops the Redis subscription once no handlers remain.
   */
  async subscribe(
    channel: string,
    callback: (message: string) => void,
  ): Promise<() => Promise<void>> {
    let handlers = this.channelHandlers.get(channel);

    if (!handlers) {
      handlers = new Set();
      this.channelHandlers.set(channel, handlers);
      await this.subscriber.subscribe(channel);
    }

    handlers.add(callback);

    return async () => {
      const current = this.channelHandlers.get(channel);
      if (!current) return;

      current.delete(callback);
      if (current.size === 0) {
        this.channelHandlers.delete(channel);
        await this.subscriber.unsubscribe(channel);
      }
    };
  }

  async onModuleDestroy() {
    this.channelHandlers.clear();
    await this.client.quit();
    await this.subscriber.quit();
  }
}
