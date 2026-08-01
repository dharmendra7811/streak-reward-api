import type { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { getIO } from '../lib/socket';
import { getTop20, myRank } from '../services/leaderboard.service';
import type { AuthUser } from '../types';

const jwtSecret = process.env.JWT_SECRET ?? '';

export function registerLeaderboardHandlers(io: Server): void {
  // Auth on the handshake — every socket carries a JWT
  io.use((socket, next) => {
    const auth = socket.handshake.auth as { token?: string };
    if (!auth.token) {
      next(new Error('Authentication required'));
      return;
    }
    try {
      const payload = jwt.verify(auth.token, jwtSecret) as jwt.JwtPayload & AuthUser;
      socket.data.userId = payload.id;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    socket.data.lastRank = null;
    socket.join('leaderboard');

    // Client subscribes and receives the current snapshot
    socket.on('leaderboard:connect', () => {
      void (async () => {
        socket.emit('leaderboard:update', await getTop20());
        await emitMyRank(socket);
      })();
    });
  });
}

/** Push the fresh top 20 to every connected client (after points change). */
export async function broadcastLeaderboardUpdate(): Promise<void> {
  const top20 = await getTop20();
  getIO().to('leaderboard').emit('leaderboard:update', top20);
}

/** Emit leaderboard:my-rank to each socket whose rank changed. */
export async function broadcastMyRanks(): Promise<void> {
  const sockets = await getIO().in('leaderboard').fetchSockets();
  await Promise.all(sockets.map((socket) => emitMyRank(socket)));
}

type RankEmitter = { data: Socket['data']; emit: Socket['emit'] };

async function emitMyRank(socket: RankEmitter): Promise<void> {
  const entry = await myRank(socket.data.userId);
  if (!entry) return;
  if (socket.data.lastRank !== entry.rank) {
    socket.data.lastRank = entry.rank;
    socket.emit('leaderboard:my-rank', entry);
  }
}
