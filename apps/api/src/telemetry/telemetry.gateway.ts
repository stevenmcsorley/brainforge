import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { TelemetryService } from './telemetry.service';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  },
  namespace: '/telemetry',
})
export class TelemetryGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  /** Runs each socket is subscribed to, so we can release them on disconnect. */
  private clientRuns = new Map<string, Set<string>>();

  constructor(private telemetryService: TelemetryService) {}

  handleConnection(client: Socket) {
    console.log(`[Telemetry] Client connected: ${client.id}`);
    this.clientRuns.set(client.id, new Set());
  }

  async handleDisconnect(client: Socket) {
    console.log(`[Telemetry] Client disconnected: ${client.id}`);

    // Release every run this socket was watching — without this, a closed tab
    // leaks its Redis subscription for the lifetime of the process.
    const runs = this.clientRuns.get(client.id);
    this.clientRuns.delete(client.id);
    if (!runs) return;

    for (const runId of runs) {
      await this.telemetryService.unsubscribeFromRun(runId);
    }
  }

  @SubscribeMessage('subscribe_run')
  async handleSubscribeRun(
    @MessageBody() data: { runId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { runId } = data;
    if (!runId) return { error: 'runId is required' };

    // Ignore a repeat subscribe from the same socket, or its refCount and the
    // room membership drift apart.
    const runs = this.clientRuns.get(client.id) ?? new Set<string>();
    this.clientRuns.set(client.id, runs);
    if (runs.has(runId)) return { subscribed: runId };

    client.join(`run:${runId}`);
    runs.add(runId);

    await this.telemetryService.subscribeToRun(runId, (eventJson) => {
      try {
        const event = JSON.parse(eventJson);
        this.server.to(`run:${runId}`).emit('telemetry_event', event);
      } catch (err) {
        console.error('[Telemetry] Failed to parse event:', err);
      }
    });

    return { subscribed: runId };
  }

  @SubscribeMessage('unsubscribe_run')
  async handleUnsubscribeRun(
    @MessageBody() data: { runId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { runId } = data;
    const runs = this.clientRuns.get(client.id);
    if (!runs?.has(runId)) return { unsubscribed: runId };

    client.leave(`run:${runId}`);
    runs.delete(runId);
    await this.telemetryService.unsubscribeFromRun(runId);

    return { unsubscribed: runId };
  }

  // Called by internal services to broadcast events
  broadcastRunEvent(runId: string, event: unknown) {
    this.server.to(`run:${runId}`).emit('telemetry_event', event);
  }
}
