import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { JwtPayload } from '../../auth/types/jwt-payload.js';
import { User } from '../../users/entities/user.entity.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { AuthUser } from '../types/auth-user.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Routes marked @Public() skip authentication
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // 2. Read "Authorization: Bearer <token>"
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthUser;
    }>();
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Missing access token');
    }

    // 3. Verify signature and expiry
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // 4. Load the user: the DB is the source of truth for role and status
    const user = await this.userRepo.findOne({
      where: { id: payload.sub },
      relations: { tenant: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or deactivated');
    }
    if (user.clubId && !user.tenant?.isActive) {
      throw new ForbiddenException('This club is deactivated');
    }

    // 5. Attach to the request so controllers can use @CurrentUser() / @ClubId()
    request.user = { id: user.id, role: user.role, clubId: user.clubId };
    return true;
  }
}