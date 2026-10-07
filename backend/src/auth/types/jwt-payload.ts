import type { UserRole } from '../../common/enums/index.js';

export interface JwtPayload {
  sub: string; // user id
  role: UserRole;
  clubId: string | null;
}