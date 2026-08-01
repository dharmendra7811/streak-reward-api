import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

/** Validates req.body against a Zod schema; passes the ZodError through on failure. */
export function validate(schema: ZodTypeAny): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}
