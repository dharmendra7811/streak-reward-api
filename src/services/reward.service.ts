import { prisma } from '../lib/prisma';
import { NotFoundError } from '../lib/errors';
import { DAILY_POINTS, MILESTONES } from './streak.service';

export async function myRewards(userId: string) {
  return prisma.reward.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function rewardsForUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  return prisma.reward.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export interface RewardSummary {
  totalPoints: number;
  currentStreak: number;
  longestStreak: number;
  nextMilestone: { threshold: number | 'daily'; points: number };
}

export async function summary(userId: string): Promise<RewardSummary> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return {
    totalPoints: user.totalPoints,
    currentStreak: user.currentStreak,
    longestStreak: user.longestStreak,
    nextMilestone: nextMilestone(user.currentStreak),
  };
}

function nextMilestone(currentStreak: number): { threshold: number | 'daily'; points: number } {
  for (const threshold of [3, 7, 14, 30]) {
    if (currentStreak < threshold) return { threshold, points: MILESTONES[threshold] ?? 0 };
  }
  return { threshold: 'daily', points: DAILY_POINTS };
}
