/**
 * Parameter decorator that injects the AuthUser attached to the request by
 * JwtAuthGuard, allowing controllers to access trusted identity and role data.
 */
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../types/auth-user.js';

/**
 * Retrieves the current authenticated user from the request.
 * @param data Unused decorator data; retained for Nest's parameter decorator API.
 * @param ctx Execution context whose HTTP request contains `user`.
 * @returns The AuthUser object `{ id, role, clubId }` attached by JwtAuthGuard.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
