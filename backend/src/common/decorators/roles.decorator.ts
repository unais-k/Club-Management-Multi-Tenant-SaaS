/**
 * Metadata decorator for declaring which account roles may access a route or
 * controller. RolesGuard reads this metadata after JwtAuthGuard authenticates.
 */
import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../enums/index.js';

/** Metadata key shared by @Roles and RolesGuard. */
export const ROLES_KEY = 'roles';
/**
 * Declares the roles allowed to call a route/controller.
 * @param roles One or more UserRole values accepted by the handler.
 * @returns Nest metadata decorator storing the supplied role list.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
