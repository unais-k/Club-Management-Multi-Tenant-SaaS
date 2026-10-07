import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocationOpeningHour } from './entities/location-opening-hour.entity.js';
import { LocationUnavailablePeriod } from './entities/location-unavailable-period.entity.js';
import { Location } from './entities/location.entity.js';
import { LocationsController } from './locations.controller.js';
import { LocationsService } from './locations.service.js';
import { Court } from '../courts/entities/court.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Location, LocationOpeningHour, LocationUnavailablePeriod, Court]),
  ],
  controllers: [LocationsController],
  providers: [LocationsService],
  exports: [LocationsService, TypeOrmModule],
})
export class LocationsModule { }