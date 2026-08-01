import { asyncHandler } from '../middleware/asyncHandler';
import * as authService from '../services/auth.service';

export const register = asyncHandler(async (req, res) => {
  res.status(201).json(await authService.register(req.body));
});

export const login = asyncHandler(async (req, res) => {
  res.json(await authService.login(req.body));
});
