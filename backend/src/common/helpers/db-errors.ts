import { QueryFailedError } from 'typeorm';

// PostgreSQL error code 23505 = unique constraint violated
export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof QueryFailedError &&
    (err.driverError as { code?: string })?.code === '23505'
  );
}