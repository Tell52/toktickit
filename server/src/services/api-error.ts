import { Response } from 'express';
import { Prisma } from '@prisma/client';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) {
    super(message);
  }
}

export function invalid(field: string, message: string): never {
  throw new ApiError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', { fields: { [field]: message } });
}

export function sendApiError(res: Response, error: unknown) {
  if (error instanceof ApiError) return res.status(error.status).json({ error: { code: error.code, message: error.message, ...error.details } });
  // Prisma 5 exposes deadlocks from model writes as UnknownRequestError rather
  // than P2034. Read only the connector's first SQLSTATE metadata, never return
  // its message or infer an error type from arbitrary user text in row details.
  const sqlState = error instanceof Prisma.PrismaClientUnknownRequestError
    ? /kind: QueryError\(PostgresError \{ code: "([A-Z0-9]{5})"/.exec(error.message)?.[1]
    : error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010' ? String(error.meta?.code) : undefined;
  const retryableState = sqlState !== undefined && ['40001', '40P01', '55P03'].includes(sqlState);
  if (retryableState) return res.status(409).json({ error: { code: 'RETRYABLE_CONFLICT', message: 'The operation conflicted with another update. Refresh and retry.' } });
  if (error instanceof Prisma.PrismaClientKnownRequestError && (
    ['P2034', 'P2028'].includes(error.code)
  )) return res.status(409).json({ error: { code: 'RETRYABLE_CONFLICT', message: 'The operation conflicted with another update. Refresh and retry.' } });
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'The operation could not be completed. Please try again.' } });
}
