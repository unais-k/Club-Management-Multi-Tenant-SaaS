/**
 * Startup task that ensures PostgreSQL has the btree_gist extension and the
 * exclusion constraint preventing overlapping confirmed bookings per court/date.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class BookingConstraintsInitializer implements OnApplicationBootstrap {
  private readonly logger = new Logger(BookingConstraintsInitializer.name);

  /**
   * @param dataSource Executes the idempotent PostgreSQL setup statements.
   * @returns No value; Nest injects the application DataSource.
   */
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Runs once after Nest finishes bootstrapping. Creates required database
   * objects only when absent, then logs that overlap protection is ready.
   * @returns Promise<void>; database errors reject startup so the API does not
   * run without its booking-overlap safety constraint.
   */
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
