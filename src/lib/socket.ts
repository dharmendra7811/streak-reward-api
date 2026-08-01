import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';

let io: Server | null = null;

export function initSocketIO(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: true },
  });
  return io;
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

/** Null when the socket layer was never booted (e.g. unit/integration tests). */
export function getIOOrNull(): Server | null {
  return io;
}
