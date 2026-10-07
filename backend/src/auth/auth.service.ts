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
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ---------- Register (consumers only) ----------
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
  async logout(userId: string) {
    await this.userRepo.update(userId, { refreshTokenHash: null });
    return { message: 'Logged out' };
  }

  // ---------- Profile ----------
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
  private async getActiveTenantBySlug(slug: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOneBy({ slug });
    if (!tenant) throw new NotFoundException('Club not found');
    if (!tenant.isActive) throw new ForbiddenException('This club is not active');
    return tenant;
  }

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

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

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