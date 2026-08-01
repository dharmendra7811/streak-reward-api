import { Router } from 'express';
import * as rewardController from '../controllers/reward.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.get('/my', requireRole('user'), rewardController.myRewards);
router.get('/summary', requireRole('user'), rewardController.summary);
router.get('/user/:id', requireRole('admin'), rewardController.userRewards);

export default router;
