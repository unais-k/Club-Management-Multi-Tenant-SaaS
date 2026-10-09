import { QueryFailedError } from 'typeorm';

// PostgreSQL error code 23505 = unique constraint violated
export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof QueryFailedError &&
    (err.driverError as { code?: string })?.code === '23505'
  );
}

// PostgreSQL error code 23P01 = exclusion constraint violated (overlapping booking)
export function isExclusionViolation(err: unknown): boolean {
  return (
    err instanceof QueryFailedError &&
    (err.driverError as { code?: string })?.code === '23P01'
  );
}

// PostgreSQL error code 23503 = foreign key constraint violated
export function isForeignKeyViolation(err: unknown): boolean {
  return (
    err instanceof QueryFailedError &&
    (err.driverError as { code?: string })?.code === '23503'
  );
}
