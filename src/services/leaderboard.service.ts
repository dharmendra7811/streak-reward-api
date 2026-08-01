import { prisma } from '../lib/prisma';
import { redis, LEADERBOARD_KEY, LEADERBOARD_META_KEY } from '../lib/redis';

export interface LeaderboardEntry {
  userId: string;
  name: string;
  points: number;
  streak: number;
}

export interface RankedEntry extends LeaderboardEntry {
  rank: number;
}

interface UserMeta {
  name: string;
  streak: number;
}

function parseMeta(raw: string | null): UserMeta {
  if (!raw) return { name: 'Unknown', streak: 0 };
  return JSON.parse(raw) as UserMeta;
}

/**
 * Rebuild the Redis leaderboard from the DB. ZSET member = userId,
 * score = total_points; a parallel hash stores name + streak per user.
 * Called after every points change (scheduler run).
 */
export async function rebuild(): Promise<void> {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, totalPoints: true, currentStreak: true },
    orderBy: { totalPoints: 'desc' },
  });

  const multi = redis.multi();
  for (const user of users) {
    multi.zadd(LEADERBOARD_KEY, user.totalPoints, user.id);
    multi.hset(
      LEADERBOARD_META_KEY,
      user.id,
      JSON.stringify({ name: user.name, streak: user.currentStreak } satisfies UserMeta),
    );
  }
  await multi.exec();
  // Invalidate REST cache
  await redis.del('leaderboard:cache');
}

export async function getTop20(): Promise<RankedEntry[]> {
  const cacheKey = 'leaderboard:cache';
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as RankedEntry[];
  }

  const rows = await redis.zrevrange(LEADERBOARD_KEY, 0, 19, 'WITHSCORES');
  const ids: string[] = [];
  const scores: number[] = [];
  for (let i = 0; i < rows.length; i += 2) {
    ids.push(rows[i]);
    scores.push(Number(rows[i + 1]));
  }
  if (ids.length === 0) return [];

  const metas = await redis.hmget(LEADERBOARD_META_KEY, ...ids);
  const top20 = ids.map((userId, i) => {
    const meta = parseMeta(metas[i] ?? null);
    return { rank: i + 1, userId, name: meta.name, points: scores[i] ?? 0, streak: meta.streak };
  });

  // Cache in Redis with 60 second TTL
  await redis.setex(cacheKey, 60, JSON.stringify(top20));
  return top20;
}

export async function myRank(userId: string): Promise<RankedEntry | null> {
  const rank = await redis.zrevrank(LEADERBOARD_KEY, userId);
  if (rank === null) return null;
  const points = Number((await redis.zscore(LEADERBOARD_KEY, userId)) ?? 0);
  const meta = parseMeta(await redis.hget(LEADERBOARD_META_KEY, userId));
  return { rank: rank + 1, userId, name: meta.name, points, streak: meta.streak };
}
