import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { ConflictError, UnauthorizedError } from '../lib/errors';
import { rebuild as rebuildLeaderboard } from './leaderboard.service';
import type { AuthUser, LoginInput, RegisterInput } from '../types';

const jwtSecret = process.env.JWT_SECRET ?? '';
const jwtExpiresIn = (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];

function signToken(user: AuthUser): string {
  return jwt.sign(user, jwtSecret, { expiresIn: jwtExpiresIn });
}

export async function register(input: RegisterInput): Promise<{ token: string; user: AuthUser }> {
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) throw new ConflictError('Email already registered');

  const password = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, password, role: input.role },
  });

  const authUser: AuthUser = { id: user.id, email: user.email, role: user.role };
  await rebuildLeaderboard();
  return { token: signToken(authUser), user: authUser };
}

export async function login(input: LoginInput): Promise<{ token: string; user: AuthUser }> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new UnauthorizedError('Invalid credentials');

  const valid = await bcrypt.compare(input.password, user.password);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  const authUser: AuthUser = { id: user.id, email: user.email, role: user.role };
  return { token: signToken(authUser), user: authUser };
}
