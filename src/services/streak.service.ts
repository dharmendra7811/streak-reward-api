import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { todayDate, toDateKey, yesterdayDate } from '../lib/dates';
import { rebuild as rebuildLeaderboard } from './leaderboard.service';
import { broadcastLeaderboardUpdate, broadcastMyRanks } from '../sockets/leaderboard.socket';

export const MILESTONES: Record<number, number> = { 3: 50, 7: 150, 14: 400, 30: 1000 };
export const DAILY_POINTS = 40;

export interface StreakRunResult {
  runDate: string;
  alreadyProcessed: boolean;
  usersProcessed: number;
  streaksIncremented: number;
  streaksReset: number;
  milestonesAwarded: number;
}

interface MilestoneReward {
  milestone: string;
  points: number;
}

function milestoneReward(newStreak: number): MilestoneReward | null {
  if (newStreak === 3 || newStreak === 7 || newStreak === 14 || newStreak === 30) {
    return { milestone: `${newStreak}`, points: MILESTONES[newStreak] ?? 0 };
  }
  if (newStreak > 30) return { milestone: 'daily', points: DAILY_POINTS };
  return null;
}

/**
 * Process streaks for all users for "today".
 *
 * Idempotency: the very first statement is the SchedulerLog insert claiming
 * today's run — `runDate` has a UNIQUE constraint, so a second run for the
 * same day fails with P2002 and we return early. Because the claim lives
 * inside the same transaction as all streak/reward writes, a crash mid-run
 * rolls everything back (day unclaimed) and the next run redoes it cleanly.
 */
export async function processDailyStreaks(): Promise<StreakRunResult> {
  const timeZone = process.env.SCHEDULER_TIMEZONE || 'Asia/Kolkata';
  const today = todayDate(timeZone);
  const yesterday = yesterdayDate(timeZone);
  const runDateKey = toDateKey(today);

  const counts = await prisma.$transaction(
    async (tx) => {
      // Claim the day — unique(run_date) is the idempotency guard
      const schedulerLog = await tx.schedulerLog.create({ data: { runDate: today } });

      const users = await tx.user.findMany();
      let streaksIncremented = 0;
      let streaksReset = 0;
      let milestonesAwarded = 0;

      for (const user of users) {
        const active = await tx.activityLog.findFirst({
          where: { userId: user.id, loggedDate: yesterday },
        });

        if (active) {
          const newStreak = user.currentStreak + 1;
          streaksIncremented++;
          const reward = milestoneReward(newStreak);
          if (reward) {
            milestonesAwarded++;
            await tx.reward.create({
              data: { userId: user.id, milestone: reward.milestone, pointsAwarded: reward.points },
            });
            await tx.user.update({
              where: { id: user.id },
              data: {
                currentStreak: newStreak,
                longestStreak: Math.max(user.longestStreak, newStreak),
                totalPoints: { increment: reward.points },
              },
            });
          } else {
            await tx.user.update({
              where: { id: user.id },
              data: {
                currentStreak: newStreak,
                longestStreak: Math.max(user.longestStreak, newStreak),
              },
            });
          }
        } else {
          streaksReset++;
          await tx.user.update({
            where: { id: user.id },
            data: { currentStreak: 0 },
          });
        }
      }

      await tx.schedulerLog.update({
        where: { id: schedulerLog.id },
        data: {
          usersProcessed: users.length,
          streaksIncremented,
          streaksReset,
          milestonesAwarded,
        },
      });

      return {
        usersProcessed: users.length,
        streaksIncremented,
        streaksReset,
        milestonesAwarded,
      };
    },
    { timeout: 60_000 },
  ).catch((err: unknown) => {
    // Unique(run_date) violation -> today was already processed
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return null;
    }
    throw err;
  });

  if (counts === null) {
    return {
      runDate: runDateKey,
      alreadyProcessed: true,
      usersProcessed: 0,
      streaksIncremented: 0,
      streaksReset: 0,
      milestonesAwarded: 0,
    };
  }

  // Points changed -> refresh the Redis leaderboard and push updates live
  await rebuildLeaderboard();
  await broadcastLeaderboardUpdate();
  await broadcastMyRanks();

  return { runDate: runDateKey, alreadyProcessed: false, ...counts };
}
