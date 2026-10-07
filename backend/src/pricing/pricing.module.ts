import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Court } from '../courts/entities/court.entity.js';
import { Location } from '../locations/entities/location.entity.js';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import { CourtPrice } from './entities/court-price.entity.js';
import { PricingShift } from './entities/pricing-shift.entity.js';
import { PricingController } from './pricing.controller.js';
import { PricingService } from './pricing.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([PricingShift, CourtPrice, Court, Location, Tenant]),
  ],
  controllers: [PricingController],
  providers: [PricingService],
  exports: [PricingService, TypeOrmModule],
})
export class PricingModule {}