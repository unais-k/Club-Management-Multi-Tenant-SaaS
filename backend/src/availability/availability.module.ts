import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from '../bookings/entities/booking.entity.js';
import { Court } from '../courts/entities/court.entity.js';
import { LocationUnavailablePeriod } from '../locations/entities/location-unavailable-period.entity.js';
import { Location } from '../locations/entities/location.entity.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import { AvailabilityController } from './availability.controller.js';
import { AvailabilityService } from './availability.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, Location, LocationUnavailablePeriod, Court, Booking]),
    PricingModule,
  ],
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}