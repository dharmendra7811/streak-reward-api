/**
 * Integration tests for the streak scheduler.
 *
 * Requirements: a running PostgreSQL and Redis (npm run setup), plus the env
 * vars from .env (dotenv loads them below). Tables are truncated before each
 * test so runs never collide on the unique run_date claim.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { redis } from '../src/lib/redis';
import { ActivityType, Role } from '@prisma/client';
import { processDailyStreaks } from '../src/services/streak.service';
import { yesterdayDate } from '../src/lib/dates';

const TZ = process.env.SCHEDULER_TIMEZONE ?? 'Asia/Kolkata';

async function truncateAll(): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE "rewards", "activity_logs", "scheduler_logs", "users" CASCADE');
}

async function createUser(overrides: { currentStreak?: number; longestStreak?: number } = {}): Promise<string> {
  const user = await prisma.user.create({
    data: {
      name: 'Test User',
      email: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`,
      password: 'hashed-not-checked-here',
      role: Role.user,
      currentStreak: overrides.currentStreak ?? 0,
      longestStreak: overrides.longestStreak ?? 0,
    },
  });
  return user.id;
}

async function logYesterday(userId: string, activityType: ActivityType = ActivityType.exercise): Promise<void> {
  await prisma.activityLog.create({
    data: { userId, activityType, loggedDate: yesterdayDate(TZ) },
  });
}

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  // Close both clients so Jest can exit cleanly (no lingering sockets)
  redis.disconnect();
  await prisma.$disconnect();
});

describe('streak scheduler', () => {
  it('increments the streak when an activity was logged yesterday', async () => {
    const userId = await createUser();
    await logYesterday(userId);

    const result = await processDailyStreaks();

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.currentStreak).toBe(1);
    expect(user.totalPoints).toBe(0);
    expect(result.alreadyProcessed).toBe(false);
    expect(result.streaksIncremented).toBe(1);
    expect(result.streaksReset).toBe(0);
    expect(result.milestonesAwarded).toBe(0);
  });

  it('resets the streak to zero when nothing was logged yesterday', async () => {
    const userId = await createUser({ currentStreak: 5, longestStreak: 5 });

    await processDailyStreaks();

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.currentStreak).toBe(0);
    // longest streak is preserved across a reset
    expect(user.longestStreak).toBe(5);
    const rewardCount = await prisma.reward.count({ where: { userId } });
    expect(rewardCount).toBe(0);
  });

  it('awards the 150-point milestone reward at 7 consecutive days', async () => {
    const userId = await createUser({ currentStreak: 6 });
    await logYesterday(userId);

    await processDailyStreaks();

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.currentStreak).toBe(7);
    expect(user.totalPoints).toBe(150);

    const rewards = await prisma.reward.findMany({ where: { userId } });
    expect(rewards).toHaveLength(1);
    expect(rewards[0]?.milestone).toBe('7');
    expect(rewards[0]?.pointsAwarded).toBe(150);
  });

  it('is idempotent — a second run for the same day does not double-award', async () => {
    const userId = await createUser({ currentStreak: 6 });
    await logYesterday(userId);

    const first = await processDailyStreaks();
    expect(first.alreadyProcessed).toBe(false);
    const second = await processDailyStreaks();

    expect(second.alreadyProcessed).toBe(true);
    expect(second.milestonesAwarded).toBe(0);
    expect(second.streaksIncremented).toBe(0);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.currentStreak).toBe(7);
    expect(user.totalPoints).toBe(150);
    expect(await prisma.reward.count({ where: { userId } })).toBe(1);
  });
});
