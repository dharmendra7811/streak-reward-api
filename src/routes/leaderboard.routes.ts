import { Router } from 'express';
import * as leaderboardController from '../controllers/leaderboard.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.get('/', leaderboardController.leaderboard);
router.get('/my-rank', leaderboardController.myRank);

export default router;
