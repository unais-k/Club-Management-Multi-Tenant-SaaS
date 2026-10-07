import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocationOpeningHour } from './entities/location-opening-hour.entity.js';
import { LocationUnavailablePeriod } from './entities/location-unavailable-period.entity.js';
import { Location } from './entities/location.entity.js';
import { LocationsController } from './locations.controller.js';
import { LocationsService } from './locations.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Location, LocationOpeningHour, LocationUnavailablePeriod]),
  ],
  controllers: [LocationsController],
  providers: [LocationsService],
  exports: [LocationsService, TypeOrmModule],
})
export class LocationsModule {}