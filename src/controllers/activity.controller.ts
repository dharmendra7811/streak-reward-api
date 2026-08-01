import { asyncHandler } from '../middleware/asyncHandler';
import * as activityService from '../services/activity.service';

export const logActivity = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  res.status(201).json(await activityService.logActivity(userId, req.body));
});

export const myActivities = asyncHandler(async (req, res) => {
  res.json(await activityService.listMyActivities(req.user!.id));
});

export const summary = asyncHandler(async (req, res) => {
  res.json(await activityService.summary(req.user!.id));
});
