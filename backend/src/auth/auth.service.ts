/**
 * Authentication business logic: consumer registration, login, refresh-token
 * rotation/reuse detection, logout, and retrieval of the current profile.
 * This is also where credentials are checked and token/session data is stored.
 */
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import { QueryFailedError, Repository } from 'typeorm';
import { UserRole } from '../common/enums/index.js';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import { User } from '../users/entities/user.entity.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import type { JwtPayload } from './types/jwt-payload.js';

@Injectable()
export class AuthService {
  /**
   * Receives database repositories and JWT/configuration services from NestJS.
   * @param userRepo Repository for account records and their password/session hashes.
   * @param tenantRepo Repository used to resolve and check club status.
   * @param jwtService Signs and verifies access and refresh JWTs.
   * @param config Reads required secrets and optional token lifetimes from env config.
   * @returns No value; dependencies are assigned to this service instance.
   */
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ---------- Register (consumers only) ----------
  /**
   * Creates a consumer account in an active club. The role is assigned here,
   * never accepted from the client; the password is stored as a bcrypt hash.
   * @param dto Club slug, display name, email, and plain-text password that passed DTO validation.
   * @returns Promise of `{ accessToken, refreshToken, user }`; the profile
   * includes id, name, normalized email, role, and clubId. Duplicate club/email
   * pairs produce HTTP 409.
   */
  async register(dto: RegisterDto) {
    const tenant = await this.getActiveTenantBySlug(dto.clubSlug);
    const email = dto.email.toLowerCase();

    if (await this.userRepo.existsBy({ clubId: tenant.id, email })) {
      throw new ConflictException('Email is already registered for this club');
    }

    try {
      const user = await this.userRepo.save(
        this.userRepo.create({
          clubId: tenant.id,
          name: dto.name,
          email,
          passwordHash: await bcrypt.hash(dto.password, 10),
          role: UserRole.CONSUMER, // fixed here: never taken from the request
        }),
      );
      return this.issueTokens(user);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string })?.code === '23505'
      ) {
        throw new ConflictException('Email is already registered for this club');
      }
      throw err;
    }
  }

  // ---------- Login ----------
  /**
   * Authenticates an account by normalized email and password. With `clubSlug`
   * it only searches that active club; without it, it only searches platform
   * accounts whose clubId is null. A successful login replaces the stored
   * refresh-token hash, so a user has one active refresh session.
   * @param dto Email/password and optional club slug provided by the login form.
   * @returns Promise of `{ accessToken, refreshToken, user }` with a safe
   * profile; bad credentials produce HTTP 401 and deactivated accounts HTTP 403.
   */
  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase();

    const qb = this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash') // select:false columns must be requested explicitly
      .where('u.email = :email', { email });

    if (dto.clubSlug) {
      const tenant = await this.getActiveTenantBySlug(dto.clubSlug);
      qb.andWhere('u.clubId = :clubId', { clubId: tenant.id });
    } else {
      qb.andWhere('u.clubId IS NULL'); // platform admin
    }

    const user = await qb.getOne();

    // Same message for "no such user" and "wrong password"
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.isActive) throw new ForbiddenException('Account is deactivated');

    return this.issueTokens(user);
  }

  // ---------- Refresh (with rotation) ----------
  /**
   * Verifies a refresh JWT, confirms it is the currently stored token, checks
   * account/club status, and issues a fresh pair. Reusing an older refresh token
   * clears the session hash to end the session.
   * @param refreshToken The refresh JWT sent by the client, not the access JWT.
   * @returns Promise of `{ accessToken, refreshToken, user }` containing the
   * rotated pair and safe profile; invalid/expired/reused tokens produce HTTP 401.
   */
  async refresh(refreshToken: string) {
    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync<{ sub: string }>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.refreshTokenHash')
      .where('u.id = :id', { id: payload.sub })
      .getOne();

    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException('Session ended, please log in again');
    }

    if (user.refreshTokenHash !== this.hashToken(refreshToken)) {
      // An old token was reused: end the session completely
      await this.userRepo.update(user.id, { refreshTokenHash: null });
      throw new UnauthorizedException('Refresh token reuse detected, please log in again');
    }

    if (user.clubId) {
      const tenant = await this.tenantRepo.findOneBy({ id: user.clubId });
      if (!tenant?.isActive) throw new ForbiddenException('This club is deactivated');
    }

    return this.issueTokens(user);
  }

  // ---------- Logout ----------
  /**
   * Invalidates a user's refresh session by removing its stored token hash.
   * @param userId Authenticated account UUID, taken from the current access token.
   * @returns Promise resolving to `{ message: "Logged out" }` after the update.
   */
  async logout(userId: string) {
    await this.userRepo.update(userId, { refreshTokenHash: null });
    return { message: 'Logged out' };
  }

  // ---------- Profile ----------
  /**
   * Loads the latest account record and its associated club for the `/auth/me`
   * response, rather than relying on possibly stale profile data in a JWT.
   * @param userId Authenticated account UUID, taken from the current access token.
   * @returns Promise of safe profile fields plus club id/name/slug/pricing model/
   * timezone, or `club: null` for a platform admin. Missing accounts produce 404.
   */
  async me(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: { tenant: true },
    });
    if (!user) throw new NotFoundException('User not found');

    return {
      ...this.toProfile(user),
      club: user.tenant
        ? {
            id: user.tenant.id,
            name: user.tenant.name,
            slug: user.tenant.slug,
            pricingModel: user.tenant.pricingModel,
            timezone: user.tenant.timezone,
          }
        : null,
    };
  }

  // ---------- Helpers ----------
  /**
   * Finds a club by its public slug and enforces that the club is active.
   * @param slug Club slug supplied during consumer registration or club login.
   * @returns The matching active Tenant entity; throws 404 if missing and 403 if inactive.
   */
  private async getActiveTenantBySlug(slug: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOneBy({ slug });
    if (!tenant) throw new NotFoundException('Club not found');
    if (!tenant.isActive) throw new ForbiddenException('This club is not active');
    return tenant;
  }

  /**
   * Creates an access JWT and a unique refresh JWT, stores only the SHA-256
   * hash of the refresh JWT, and builds the safe user-profile portion.
   * @param user Persisted account whose id, role, and club scope go into tokens.
   * @returns Promise of `{ accessToken, refreshToken, user }`; example:
   * `{ accessToken: "<jwt>", refreshToken: "<jwt>", user: { id, name, email, role, clubId } }`.
   */
  private async issueTokens(user: User) {
    const accessPayload: JwtPayload = {
      sub: user.id,
      role: user.role,
      clubId: user.clubId,
    };

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: Number(this.config.get('JWT_ACCESS_EXPIRES_SECONDS') ?? 900),
    });

    // jti makes every refresh token unique, even if issued in the same second
    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, jti: randomUUID() },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: Number(this.config.get('JWT_REFRESH_EXPIRES_SECONDS') ?? 604800),
      },
    );

    await this.userRepo.update(user.id, {
      refreshTokenHash: this.hashToken(refreshToken),
    });

    return { accessToken, refreshToken, user: this.toProfile(user) };
  }

  /**
   * Produces a one-way SHA-256 digest so the database never stores the raw
   * refresh token. This digest is compared during refresh-token rotation.
   * @param token Raw signed refresh JWT.
   * @returns Lowercase hexadecimal SHA-256 digest string, never the input token.
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Removes password/session secrets and selects only client-safe account fields.
   * @param user Account entity loaded from the database.
   * @returns `{ id, name, email, role, clubId }`; for example
   * `{ id: "<uuid>", name: "Aisha Khan", email: "aisha@example.com", role: "consumer", clubId: "<uuid>" }`.
   */
  private toProfile(user: User) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      clubId: user.clubId,
    };
  }
}
