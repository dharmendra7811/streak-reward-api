import { asyncHandler } from '../middleware/asyncHandler';
import { prisma } from '../lib/prisma';
import { processDailyStreaks } from '../services/streak.service';
import { toDateKey } from '../lib/dates';

export const history = asyncHandler(async (_req, res) => {
  const logs = await prisma.schedulerLog.findMany({
    orderBy: { runDate: 'desc' },
    take: 30,
  });
  res.json(
    logs.map((log) => ({
      id: log.id,
      date: toDateKey(log.runDate),
      usersProcessed: log.usersProcessed,
      streaksIncremented: log.streaksIncremented,
      streaksReset: log.streaksReset,
      milestonesAwarded: log.milestonesAwarded,
      createdAt: log.createdAt,
    })),
  );
});

export const run = asyncHandler(async (_req, res) => {
  res.json(await processDailyStreaks());
});
