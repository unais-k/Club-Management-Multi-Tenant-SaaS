import { UserRole } from '../enums/index.js';

// A class (not an interface) so it can be used safely in decorated parameters
export class AuthUser {
  id: string;
  role: UserRole;
  clubId: string | null;
}