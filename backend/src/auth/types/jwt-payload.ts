/**
 * TypeScript shape of claims placed in the access JWT and read by auth guards.
 * Refresh tokens intentionally use a smaller payload (`sub` and unique `jti`).
 */
import type { UserRole } from '../../common/enums/index.js';

export interface JwtPayload {
  /** Account UUID; JWT standard subject claim. */
  sub: string;
  /** Authorization role checked by role guards. */
  role: UserRole;
  /** Tenant/club UUID for club accounts, null for platform-level accounts. */
  clubId: string | null;
}
