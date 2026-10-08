import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Location } from '../locations/entities/location.entity.js';
import { CourtsController } from './courts.controller.js';
import { CourtsService } from './courts.service.js';
import { CourtOpeningHour } from './entities/court-opening-hour.entity.js';
import { Court } from './entities/court.entity.js';import { BookingsModule } from '../bookings/bookings.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Court, CourtOpeningHour, Location]),BookingsModule],
  controllers: [CourtsController],
  providers: [CourtsService],
  exports: [CourtsService, TypeOrmModule],
})
export class CourtsModule {}