import { Router } from 'express';
import * as activityController from '../controllers/activity.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { logActivitySchema } from '../types';

const router = Router();

router.use(authenticate, requireRole('user'));
router.post('/log', validate(logActivitySchema), activityController.logActivity);
router.get('/my', activityController.myActivities);
router.get('/summary', activityController.summary);

export default router;
