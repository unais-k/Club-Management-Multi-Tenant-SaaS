/**
 * Trusted authenticated-user shape attached to each authorized request by
 * JwtAuthGuard and consumed by @CurrentUser/@ClubId parameter decorators.
 */
import { UserRole } from '../enums/index.js';

// A class (not an interface) so it can be used safely in decorated parameters
export class AuthUser {
  id: string;
  role: UserRole;
  clubId: string | null;
}
