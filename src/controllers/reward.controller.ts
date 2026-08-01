import { asyncHandler } from '../middleware/asyncHandler';
import * as rewardService from '../services/reward.service';

export const myRewards = asyncHandler(async (req, res) => {
  res.json(await rewardService.myRewards(req.user!.id));
});

export const summary = asyncHandler(async (req, res) => {
  res.json(await rewardService.summary(req.user!.id));
});

export const userRewards = asyncHandler(async (req, res) => {
  res.json(await rewardService.rewardsForUser(req.params.id));
});
