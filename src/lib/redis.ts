import { Redis } from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
});

export const LEADERBOARD_KEY = 'leaderboard';
export const LEADERBOARD_META_KEY = 'leaderboard:meta';
