import { io, Socket } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || window.location.origin;

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(`${WS_URL}/telemetry`, {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      console.log('[WS] Connected to telemetry');
    });

    socket.on('disconnect', (reason) => {
      console.log('[WS] Disconnected:', reason);
    });
  }
  return socket;
}

export function subscribeToRun(
  runId: string,
  callback: (event: any) => void,
): () => void {
  const s = getSocket();
  s.emit('subscribe_run', { runId });

  // Filter so only events for this runId reach the callback
  const handler = (event: any) => {
    if (!event.runId || event.runId === runId) {
      callback(event);
    }
  };
  s.on('telemetry_event', handler);

  return () => {
    s.emit('unsubscribe_run', { runId });
    s.off('telemetry_event', handler);
  };
}

export function sendRunCommand(
  runId: string,
  command: 'pause' | 'resume' | 'stop',
): void {
  const s = getSocket();
  s.emit('run_command', { runId, command });
}
