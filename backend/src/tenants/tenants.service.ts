import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import { DataSource, ILike, QueryFailedError, Repository } from 'typeorm';
import { UserRole } from '../common/enums/index.js';
import { User } from '../users/entities/user.entity.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { ListTenantsQueryDto } from './dto/list-tenants-query.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import { Tenant } from './entities/tenant.entity.js';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateTenantDto): Promise<Tenant> {
    this.assertValidTimezone(dto.timezone);

    if ((await this.tenantRepo.countBy({ slug: dto.slug })) > 0) {
      throw new ConflictException(`Slug "${dto.slug}" is already taken`);
    }

    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);

    try {
      // Transaction: both rows are saved, or neither is
      return await this.dataSource.transaction(async (manager) => {
        const tenant = await manager.save(
          manager.create(Tenant, {
            name: dto.name,
            slug: dto.slug,
            pricingModel: dto.pricingModel,
            ...(dto.timezone && { timezone: dto.timezone }),
          }),
        );

        await manager.save(
          manager.create(User, {
            clubId: tenant.id,
            name: dto.adminName,
            email: dto.adminEmail.toLowerCase(),
            passwordHash,
            role: UserRole.CLUB_ADMIN,
          }),
        );

        return tenant;
      });
    } catch (err) {
      // Two requests with the same slug at the same moment: DB unique index wins
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string })?.code === '23505'
      ) {
        throw new ConflictException(`Slug "${dto.slug}" is already taken`);
      }
      throw err;
    }
  }

  async findAll(query: ListTenantsQueryDto) {
    const { page, limit, search } = query;

    const [data, total] = await this.tenantRepo.findAndCount({
      where: search ? { name: ILike(`%${search}%`) } : {},
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOneBy({ id });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    this.assertValidTimezone(dto.timezone);
    const tenant = await this.findOne(id);
    Object.assign(tenant, dto);
    return this.tenantRepo.save(tenant);
  }

  async setStatus(id: string, isActive: boolean): Promise<Tenant> {
    const tenant = await this.findOne(id);
    tenant.isActive = isActive;
    return this.tenantRepo.save(tenant);
  }

  // Timezone matters later for availability, so reject invalid names early
  private assertValidTimezone(timezone?: string) {
    if (!timezone) return;
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone });
    } catch {
      throw new BadRequestException(`Invalid timezone "${timezone}"`);
    }
  }
}