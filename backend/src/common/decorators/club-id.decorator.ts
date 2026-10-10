/**
 * Parameter decorator for obtaining the authenticated user's club UUID from
 * the request. It never trusts a club id supplied by a client request body or URL.
 */
import {
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { AuthUser } from '../types/auth-user.js';

/**
 * Extracts the club scope established by JwtAuthGuard.
 * @param data Unused decorator data; retained to satisfy Nest's param-decorator API.
 * @param ctx Nest execution context used to access the current HTTP request.
 * @returns Authenticated user's club UUID; throws HTTP 403 for platform accounts
 * or requests without a club-scoped authenticated user.
 */
export const ClubId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user?.clubId) {
      throw new ForbiddenException('This action requires a club account');
    }
    return user.clubId;
  },
);
