import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import activityRoutes from './routes/activity.routes';
import leaderboardRoutes from './routes/leaderboard.routes';
import rewardsRoutes from './routes/rewards.routes';
import schedulerRoutes from './routes/scheduler.routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp(): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/auth', authRoutes);
  app.use('/activities', activityRoutes);
  app.use('/leaderboard', leaderboardRoutes);
  app.use('/rewards', rewardsRoutes);
  app.use('/scheduler', schedulerRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
