import { asyncHandler } from '../middleware/asyncHandler';
import { prisma } from '../lib/prisma';
import { processDailyStreaks } from '../services/streak.service';

export const history = asyncHandler(async (_req, res) => {
  const logs = await prisma.schedulerLog.findMany({
    orderBy: { runDate: 'desc' },
    take: 30,
  });
  res.json(logs);
});

export const run = asyncHandler(async (_req, res) => {
  res.json(await processDailyStreaks());
});
