import { Router } from 'express';
import * as schedulerController from '../controllers/scheduler.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate, requireRole('admin'));
router.get('/history', schedulerController.history);
router.post('/run', schedulerController.run);

export default router;
