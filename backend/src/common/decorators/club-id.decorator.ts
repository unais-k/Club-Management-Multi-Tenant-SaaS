import {
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { AuthUser } from '../types/auth-user.js';

// Returns the logged-in user's clubId. Never reads it from request input.
export const ClubId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user?.clubId) {
      throw new ForbiddenException('This action requires a club account');
    }
    return user.clubId;
  },
);