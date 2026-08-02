import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, `Route ${req.method} ${req.path} not found`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { message: 'Validation failed', details: err.issues },
    });
    return;
  }

  // Handle body-parser JSON parsing syntax errors (e.g. invalid quotes, keys)
  if (err instanceof SyntaxError && 'status' in err && err.status === 400 && 'body' in err) {
    res.status(400).json({ error: { message: 'Invalid JSON format' } });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: { message: 'Duplicate entry', target: err.meta?.target } });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: { message: 'Record not found' } });
      return;
    }
  }

  if (err instanceof AppError) {
    res.status(err.status).json({ error: { message: err.message, code: err.code } });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { message: 'Internal server error' } });
};
