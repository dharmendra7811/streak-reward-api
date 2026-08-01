import rateLimit from 'express-rate-limit';

/** POST /auth/login — max 5 attempts per minute per IP (bonus requirement). */
export const loginRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many login attempts, try again in a minute' } },
});
