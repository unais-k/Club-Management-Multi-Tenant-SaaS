/**
 * Authorization guard that enforces @Roles metadata after authentication.
 * Routes without role metadata allow any authenticated user.
 */
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { UserRole } from '../enums/index.js';
import type { AuthUser } from '../types/auth-user.js';

@Injectable()
export class RolesGuard implements CanActivate {
  /**
   * @param reflector Reads required-role metadata from route/controller decorators.
   * @returns No value; Nest injects the Reflector for metadata lookups.
   */
  constructor(private readonly reflector: Reflector) {}

  /**
   * Checks that the authenticated request user has one of the route's allowed roles.
   * @param context Nest execution context with role metadata and the request user.
   * @returns `true` when no roles are required or the user role is allowed;
   * otherwise throws HTTP 403.
   */
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true; // no @Roles = any logged-in user

    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException('You do not have permission for this action');
    }
    return true;
  }
}
