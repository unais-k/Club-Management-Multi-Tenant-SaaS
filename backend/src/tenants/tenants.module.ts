import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourtOpeningHour } from '../courts/entities/court-opening-hour.entity.js';
import { Court } from '../courts/entities/court.entity.js';
import { LocationOpeningHour } from '../locations/entities/location-opening-hour.entity.js';
import { LocationUnavailablePeriod } from '../locations/entities/location-unavailable-period.entity.js';
import { Location } from '../locations/entities/location.entity.js';
import { CourtPrice } from '../pricing/entities/court-price.entity.js';
import { PricingShift } from '../pricing/entities/pricing-shift.entity.js';
import { Membership } from '../memberships/entities/membership.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Tenant } from './entities/tenant.entity.js';
import { TenantsController } from './tenants.controller.js';
import { TenantsService } from './tenants.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tenant,
      User,
      Location,
      LocationOpeningHour,
      LocationUnavailablePeriod,
      Court,
      CourtOpeningHour,
      PricingShift,
      CourtPrice,
      Membership,
    ]),
  ],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
