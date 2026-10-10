/**
 * Metadata decorator used to mark an endpoint or controller as not requiring
 * JWT authentication; JwtAuthGuard reads the same metadata key.
 */
import { SetMetadata } from '@nestjs/common';

/** Metadata key shared by @Public and JwtAuthGuard. */
export const IS_PUBLIC_KEY = 'isPublic';
/**
 * Marks a route/controller as public for authentication purposes.
 * @returns Nest metadata decorator that stores `isPublic: true`.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
