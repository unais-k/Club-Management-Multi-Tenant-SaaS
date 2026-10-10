/**
 * HTTP boundary for authentication endpoints under `/auth`.
 * Converts validated request bodies and the authenticated request user into
 * calls to AuthService; the service owns the actual authentication rules.
 */
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { AuthUser } from '../common/types/auth-user.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  /**
   * Creates the controller with its authentication business-logic service.
   * @param authService AuthService injected by NestJS; used by every route here.
   * @returns No value; Nest stores the dependency on this controller instance.
   */
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register as a consumer of a club' })
  /**
   * Registers a consumer in the club named by the request's slug.
   * @param dto Validated club slug, name, email, and password from the JSON body.
   * @returns Promise of the access token, refresh token, and safe user profile;
   * for example `{ accessToken: "<jwt>", refreshToken: "<jwt>", user: { id, name, email, role, clubId } }`.
   */
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @ApiOperation({
    summary: 'Login (clubSlug for club users, none for platform admin)',
  })
  /**
   * Authenticates a club user or platform admin. The optional slug chooses the
   * club account namespace; omitting it selects a platform-level account.
   * @param dto Validated email/password and optional club slug from the JSON body.
   * @returns Promise of the access token, refresh token, and safe user profile,
   * in the same shape as register; invalid credentials produce HTTP 401.
   */
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair' })
  /**
   * Rotates a valid refresh token and returns a replacement token pair.
   * @param dto Request body containing the current refresh token.
   * @returns Promise of new access/refresh tokens and the user's safe profile;
   * an invalid, expired, or previously used token produces HTTP 401.
   */
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Logout (invalidates the refresh token)' })
  /**
   * Ends the current user's refresh-token session. The access token itself
   * remains valid until its expiry because access tokens are stateless.
   * @param user Authenticated user extracted from the verified access token.
   * @returns Promise of `{ message: "Logged out" }` after clearing the stored
   * refresh-token hash.
   */
  logout(@CurrentUser() user: AuthUser) {
    return this.authService.logout(user.id);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Current user profile' })
  /**
   * Reads the authenticated user's current profile and, for club users, club
   * details. It is useful for initializing the signed-in client session.
   * @param user Authenticated user extracted from the verified access token.
   * @returns Promise of safe user fields plus `club` details, or `club: null`
   * for a platform admin; for example `{ id, name, email, role, clubId, club }`.
   */
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.id);
  }
}
