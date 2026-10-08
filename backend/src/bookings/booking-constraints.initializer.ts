import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class BookingConstraintsInitializer implements OnApplicationBootstrap {
  private readonly logger = new Logger(BookingConstraintsInitializer.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap() {
    // btree_gist lets a GiST index combine "=" (uuid, date) with "&&" (range overlap)
    await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS btree_gist');

    await this.dataSource.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'EXCL_bookings_no_overlap'
        ) THEN
          ALTER TABLE bookings ADD CONSTRAINT "EXCL_bookings_no_overlap"
            EXCLUDE USING gist (
              "courtId" WITH =,
              "date" WITH =,
              int4range("startMinute"::int, "endMinute"::int) WITH &&
            ) WHERE ("status" = 'CONFIRMED');
        END IF;
      END $$;
    `);

    this.logger.log('Booking overlap constraint is in place');
  }
}