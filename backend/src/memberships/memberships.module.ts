import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Location } from '../locations/entities/location.entity.js';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import { User } from '../users/entities/user.entity.js';
import { MembershipPrice } from './entities/membership-price.entity.js';
import { Membership } from './entities/membership.entity.js';
import { UserMembership } from './entities/user-membership.entity.js';
import { MeMembershipController } from './me-membership.controller.js';
import { MembershipsController } from './memberships.controller.js';
import { MembershipsService } from './memberships.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Membership,
      MembershipPrice,
      UserMembership,
      Tenant,
      Location,
      User,
    ]),
  ],
  controllers: [MembershipsController, MeMembershipController],
  providers: [MembershipsService],
  exports: [MembershipsService, TypeOrmModule],
})
export class MembershipsModule {}