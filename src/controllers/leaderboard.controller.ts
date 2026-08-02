import { asyncHandler } from '../middleware/asyncHandler';
import { NotFoundError } from '../lib/errors';
import * as leaderboardService from '../services/leaderboard.service';

export const leaderboard = asyncHandler(async (_req, res) => {
  res.json(await leaderboardService.getTop20());
});

export const myRank = asyncHandler(async (req, res) => {
  const entry = await leaderboardService.myRank(req.user!.id);
  if (!entry) throw new NotFoundError('User not on leaderboard');
  res.json(entry);
});
