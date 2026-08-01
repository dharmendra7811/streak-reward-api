import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError } from '../lib/errors';
import { dateKeyToDate, todayDate, toDateKey } from '../lib/dates';
import type { LogActivityInput } from '../types';

const TZ = process.env.SCHEDULER_TIMEZONE ?? 'Asia/Kolkata';

export async function logActivity(userId: string, input: LogActivityInput) {
  const loggedDate = input.date ? dateKeyToDate(input.date) : todayDate(TZ);
  try {
    return await prisma.activityLog.create({
      data: { userId, activityType: input.activity_type, loggedDate },
    });
  } catch (err) {
    // Unique (userId, activityType, loggedDate) — same type twice in a day
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('Activity already logged for this type today');
    }
    throw err;
  }
}

export async function listMyActivities(userId: string) {
  const logs = await prisma.activityLog.findMany({
    where: { userId },
    orderBy: { loggedDate: 'desc' },
  });
  const contributed = await contributedDates(userId);
  return logs.map((log) => ({
    id: log.id,
    date: toDateKey(log.loggedDate),
    type: log.activityType,
    contributed: contributed.has(toDateKey(log.loggedDate)),
  }));
}

export async function summary(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const todayLogs = await prisma.activityLog.findMany({
    where: { userId, loggedDate: todayDate(TZ) },
  });
  return {
    todayActivities: todayLogs.map((log) => log.activityType),
    currentStreak: user.currentStreak,
    totalPoints: user.totalPoints,
  };
}

/**
 * Dates that are part of the current consecutive run. Walks back from today
 * while each preceding day has a log — those days are the ones that
 * "contributed" to the current streak.
 */
async function contributedDates(userId: string): Promise<Set<string>> {
  const logs = await prisma.activityLog.findMany({
    where: { userId },
    select: { loggedDate: true },
  });
  const logged = new Set(logs.map((log) => toDateKey(log.loggedDate)));

  const contributed = new Set<string>();
  const cursor = todayDate(TZ);
  while (logged.has(toDateKey(cursor))) {
    contributed.add(toDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return contributed;
}
