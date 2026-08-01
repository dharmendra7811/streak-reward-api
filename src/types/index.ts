import { z } from 'zod';
import type { Role } from '@prisma/client';

// ---------- Zod schemas (all request bodies) ----------

export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  role: z.enum(['admin', 'user']),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const logActivitySchema = z.object({
  activity_type: z.enum(['exercise', 'meditation', 'reading', 'hydration']),
  date: z.string().regex(datePattern, 'date must be YYYY-MM-DD').optional(),
});
export type LogActivityInput = z.infer<typeof logActivitySchema>;

// ---------- Authenticated request user ----------

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

declare module 'socket.io' {
  interface SocketData {
    userId: string;
    lastRank: number | null;
  }
}
