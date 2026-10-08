import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Court } from '../courts/entities/court.entity.js';
import { LocationUnavailablePeriod } from '../locations/entities/location-unavailable-period.entity.js';
import { Location } from '../locations/entities/location.entity.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import { BookingConstraintsInitializer } from './booking-constraints.initializer.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';
import { Booking } from './entities/booking.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, Tenant, Court, Location, LocationUnavailablePeriod]),
    PricingModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService, BookingConstraintsInitializer],
  exports: [BookingsService, TypeOrmModule],
})
export class BookingsModule {}