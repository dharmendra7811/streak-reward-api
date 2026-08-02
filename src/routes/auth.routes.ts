import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { loginRateLimiter } from '../middleware/rateLimiter';
import { loginSchema, registerSchema } from '../types';

const router = Router();

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', loginRateLimiter, validate(loginSchema), authController.login);

export default router;
