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

  constructor(private telemetryService: TelemetryService) {}

  handleConnection(client: Socket) {
    console.log(`[Telemetry] Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`[Telemetry] Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe_run')
  async handleSubscribeRun(
    @MessageBody() data: { runId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { runId } = data;
    client.join(`run:${runId}`);

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
  handleUnsubscribeRun(
    @MessageBody() data: { runId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(`run:${data.runId}`);
    return { unsubscribed: data.runId };
  }

  // Called by internal services to broadcast events
  broadcastRunEvent(runId: string, event: unknown) {
    this.server.to(`run:${runId}`).emit('telemetry_event', event);
  }
}
