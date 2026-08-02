import 'dotenv/config';
import http from 'http';
import { createApp } from './app';
import { initSocketIO } from './lib/socket';
import { redis } from './lib/redis';
import { prisma } from './lib/prisma';
import { registerLeaderboardHandlers } from './sockets/leaderboard.socket';
import { startScheduler } from './scheduler/streak.scheduler';

async function bootstrap(): Promise<void> {
  const app = createApp();
  const server = http.createServer(app);

  const io = initSocketIO(server);
  registerLeaderboardHandlers(io);
  startScheduler();

  await redis.ping();

  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

bootstrap().catch((err: unknown) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
