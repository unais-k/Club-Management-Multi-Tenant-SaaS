import bcrypt from 'bcryptjs';
import type { EntityManager } from 'typeorm';
import { Booking } from '../bookings/entities/booking.entity.js';
import { BookingStatus, PricingModel, UserRole } from '../common/enums/index.js';
import { addDays, nowInTimezone } from '../common/helpers/date.js';
import { toMinutes as t } from '../common/helpers/time.js';
import { CourtOpeningHour } from '../courts/entities/court-opening-hour.entity.js';
import { Court } from '../courts/entities/court.entity.js';
import { LocationOpeningHour } from '../locations/entities/location-opening-hour.entity.js';
import { LocationUnavailablePeriod } from '../locations/entities/location-unavailable-period.entity.js';
import { Location } from '../locations/entities/location.entity.js';
import { MembershipPayment } from '../memberships/entities/membership-payment.entity.js';
import { Membership } from '../memberships/entities/membership.entity.js';
import { MembershipPackage } from '../memberships/entities/membership-package.entity.js';
import { MembershipPrice } from '../memberships/entities/membership-price.entity.js';
import { UserMembership } from '../memberships/entities/user-membership.entity.js';
import { CourtPrice } from '../pricing/entities/court-price.entity.js';
import { PricingShift } from '../pricing/entities/pricing-shift.entity.js';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import { User } from '../users/entities/user.entity.js';
import dataSource from './data-source.js';

const DEMO_PASSWORD = 'Demo@12345';
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];
const DAY_MS = 24 * 60 * 60 * 1000;

// Price for a duration, scaled from the 60-minute price (rounded to cents)
const scale = (price60: number, minutes: number) =>
  Math.round(((price60 * minutes) / 60) * 100) / 100;

const weeklyRows = (days: number[], open: string, close: string) =>
  days.map((dayOfWeek) => ({ dayOfWeek, startMinute: t(open), endMinute: t(close) }));

const makeUser = (
  m: EntityManager,
  clubId: string | null,
  name: string,
  email: string,
  role: UserRole,
  passwordHash: string,
) => m.save(m.create(User, { clubId, name, email, passwordHash, role }));

// ---------------------------------------------------------------------------
// Club 1: SHIFT_BASED
// ---------------------------------------------------------------------------
async function seedShiftClub(m: EntityManager, passwordHash: string) {
  const timezone = 'Asia/Kolkata';
  const club = await m.save(
    m.create(Tenant, {
      name: 'Downtown Sports Club',
      slug: 'downtown-sports',
      pricingModel: PricingModel.SHIFT_BASED,
      timezone,
    }),
  );
  const clubId = club.id;

  await makeUser(m, clubId, 'Downtown Admin', 'admin@downtown.com', UserRole.CLUB_ADMIN, passwordHash);
  const aisha = await makeUser(m, clubId, 'Aisha Khan', 'aisha@downtown.com', UserRole.CONSUMER, passwordHash);
  const omar = await makeUser(m, clubId, 'Omar Ali', 'omar@downtown.com', UserRole.CONSUMER, passwordHash);

  // ----- Location 1: shows most features -----
  const center = await m.save(
    m.create(Location, {
      clubId,
      name: 'Downtown Sports Center',
      address: '12 Main Street',
      details: 'Indoor courts with free parking',
      durations: [30, 60, 90, 120],
    }),
  );
  await m.insert(
    LocationOpeningHour,
    [
      ...weeklyRows(WEEKDAYS, '06:00', '23:00'),
      ...weeklyRows(WEEKEND, '08:00', '22:00'),
    ].map((r) => ({ clubId, locationId: center.id, ...r })),
  );
  await m.insert(LocationUnavailablePeriod, [
    {
      clubId,
      locationId: center.id,
      date: '2026-12-25',
      startMinute: t('10:00'),
      endMinute: t('15:00'),
      reason: 'Christmas Event',
    },
  ]);

  const court1 = await m.save(
    m.create(Court, { clubId, locationId: center.id, name: 'Court 1', description: 'Show court with glass walls' }),
  );
  const court2 = await m.save(
    m.create(Court, {
      clubId,
      locationId: center.id,
      name: 'Court 2',
      description: 'Own hours: 08:00-21:00 every day',
      useCustomHours: true,
    }),
  );
  const court3 = await m.save(
    m.create(Court, {
      clubId,
      locationId: center.id,
      name: 'Court 3',
      description: 'Offers 60 and 90 minute sessions only',
      durations: [60, 90],
    }),
  );
  await m.insert(
    CourtOpeningHour,
    weeklyRows(ALL_DAYS, '08:00', '21:00').map((r) => ({ clubId, courtId: court2.id, ...r })),
  );

  // Shifts: any time outside them uses the Normal price
  const morning = await m.save(
    m.create(PricingShift, { clubId, locationId: center.id, name: 'Morning Peak', startMinute: t('06:00'), endMinute: t('09:00') }),
  );
  const evening = await m.save(
    m.create(PricingShift, { clubId, locationId: center.id, name: 'Evening Peak', startMinute: t('19:00'), endMinute: t('23:00') }),
  );

  const priceRows = (courtId: string, durations: number[], morning60: number, normal60: number, evening60: number) =>
    durations.flatMap((d) => [
      { clubId, courtId, shiftId: morning.id, durationMinutes: d, price: scale(morning60, d) },
      { clubId, courtId, shiftId: null, durationMinutes: d, price: scale(normal60, d) },
      { clubId, courtId, shiftId: evening.id, durationMinutes: d, price: scale(evening60, d) },
    ]);
  await m.insert(CourtPrice, [
    ...priceRows(court1.id, center.durations, 20, 15, 25),
    ...priceRows(court2.id, center.durations, 25, 20, 30),
    ...priceRows(court3.id, [60, 90], 18, 12, 22),
  ]);

  // ----- Location 2: no shifts, so every time uses the Normal price -----
  const riverside = await m.save(
    m.create(Location, {
      clubId,
      name: 'Riverside Courts',
      address: '4 River Road',
      details: 'Outdoor courts',
      durations: [60, 90],
    }),
  );
  await m.insert(
    LocationOpeningHour,
    weeklyRows(ALL_DAYS, '07:00', '22:00').map((r) => ({ clubId, locationId: riverside.id, ...r })),
  );
  const courtA = await m.save(m.create(Court, { clubId, locationId: riverside.id, name: 'Court A' }));
  const courtB = await m.save(m.create(Court, { clubId, locationId: riverside.id, name: 'Court B' }));
  await m.insert(
    CourtPrice,
    [courtA.id, courtB.id].flatMap((courtId) => [
      { clubId, courtId, shiftId: null, durationMinutes: 60, price: 18 },
      { clubId, courtId, shiftId: null, durationMinutes: 90, price: 26 },
    ]),
  );

  // ----- Bookings (times are valid on every weekday and weekend day) -----
  const today = nowInTimezone(timezone).date;
  const booking = (
    courtId: string,
    userId: string,
    date: string,
    start: string,
    minutes: number,
    price: number,
    status = BookingStatus.CONFIRMED,
  ) => ({
    clubId,
    locationId: center.id,
    courtId,
    userId,
    date,
    startMinute: t(start),
    endMinute: t(start) + minutes,
    durationMinutes: minutes,
    price,
    pricingModel: PricingModel.SHIFT_BASED,
    status,
    cancelledAt: status === BookingStatus.CANCELLED ? new Date() : null,
  });
  await m.insert(Booking, [
    booking(court1.id, aisha.id, addDays(today, -3), '09:00', 60, 15), // history
    booking(court1.id, aisha.id, addDays(today, 1), '10:00', 60, 15), // upcoming, Normal price
    booking(court2.id, omar.id, addDays(today, 1), '19:00', 60, 30), // upcoming, Evening Peak
    booking(court1.id, aisha.id, addDays(today, 2), '08:00', 60, 20), // upcoming, Morning Peak
    booking(court1.id, omar.id, addDays(today, 1), '12:00', 60, 15, BookingStatus.CANCELLED), // cancelled: does not block the slot
  ]);
}

// ---------------------------------------------------------------------------
// Club 2: MEMBERSHIP_BASED
// ---------------------------------------------------------------------------
async function seedMembershipClub(m: EntityManager, passwordHash: string) {
  const timezone = 'Asia/Dubai';
  const club = await m.save(
    m.create(Tenant, {
      name: 'Lakeside Racquet Club',
      slug: 'lakeside-racquet',
      pricingModel: PricingModel.MEMBERSHIP_BASED,
      timezone,
    }),
  );
  const clubId = club.id;

  await makeUser(m, clubId, 'Lakeside Admin', 'admin@lakeside.com', UserRole.CLUB_ADMIN, passwordHash);
  const lena = await makeUser(m, clubId, 'Lena Fischer', 'lena@lakeside.com', UserRole.CONSUMER, passwordHash);
  const sam = await makeUser(m, clubId, 'Sam Carter', 'sam@lakeside.com', UserRole.CONSUMER, passwordHash);
  const amir = await makeUser(m, clubId, 'Amir Rahman', 'amir@lakeside.com', UserRole.CONSUMER, passwordHash);

  const lakeside = await m.save(
    m.create(Location, {
      clubId,
      name: 'Lakeside Courts',
      address: '1 Lake Avenue',
      details: 'Racquet sports',
      durations: [30, 60, 90],
    }),
  );
  await m.insert(
    LocationOpeningHour,
    weeklyRows(ALL_DAYS, '06:00', '23:00').map((r) => ({ clubId, locationId: lakeside.id, ...r })),
  );
  const court1 = await m.save(m.create(Court, { clubId, locationId: lakeside.id, name: 'Court 1' }));
  await m.save(m.create(Court, { clubId, locationId: lakeside.id, name: 'Court 2' }));

  const planSpecs = [
    {
      name: 'Basic',
      description: 'Standard member package options',
      rates: { 30: 20, 60: 38, 90: 50 },
    },
    {
      name: 'Premium',
      description: 'Discounted member package options',
      rates: { 30: 18, 60: 35, 90: 46 },
    },
    {
      name: 'VIP',
      description: 'Best member package options',
      rates: { 30: 15, 60: 30, 90: 40 },
    },
  ];
  const plans: Record<string, Membership> = {};
  const packages: Record<string, Record<number, MembershipPackage>> = {};
  for (const spec of planSpecs) {
    const plan = await m.save(
      m.create(Membership, {
        clubId,
        name: spec.name,
        description: spec.description,
        validityDays: 30,
      }),
    );
    plans[spec.name] = plan;
    packages[spec.name] = {};
    await m.insert(
      MembershipPrice,
      Object.entries(spec.rates).map(([duration, price]) => ({
        clubId,
        membershipId: plan.id,
        durationMinutes: Number(duration),
        price,
      })),
    );
    for (const [duration, pricePerBooking] of Object.entries(spec.rates)) {
      const option = await m.save(
        m.create(MembershipPackage, {
          clubId,
          membershipId: plan.id,
          validityDays: 30,
          bookingDurationMinutes: Number(duration),
          includedBookings: 24,
          pricePerBooking,
        }),
      );
      packages[spec.name][Number(duration)] = option;
    }
  }

  const now = new Date();
  const createAssignment = async (
    user: User,
    plan: Membership,
    packageOption: MembershipPackage,
    startsAt: Date,
    expiresAt: Date,
    paidAt: Date | null,
  ) => {
    const packageFee = Math.round(packageOption.pricePerBooking * packageOption.includedBookings * 100) / 100;
    const assignment = await m.save(
      m.create(UserMembership, {
        clubId,
        userId: user.id,
        membershipId: plan.id,
        packageId: packageOption.id,
        packageFee,
        startsAt,
        expiresAt,
        paidAt,
      }),
    );
    await m.save(
      m.create(MembershipPayment, {
        clubId,
        userId: user.id,
        userMembershipId: assignment.id,
        amount: packageFee,
        status: paidAt ? 'SIMULATED_PAID' : 'PENDING',
        method: paidAt ? 'DEMO' : null,
        paidAt,
      }),
    );
    return assignment;
  };

  // Lena: active Premium package with a demo receipt and remaining credits.
  const lenaAssignment = await createAssignment(
    lena,
    plans.Premium,
    packages.Premium[60],
    now,
    new Date(now.getTime() + 30 * DAY_MS),
    now,
  );
  // Sam: expired Basic package, retained as membership history.
  await createAssignment(
    sam,
    plans.Basic,
    packages.Basic[30],
    new Date(now.getTime() - 40 * DAY_MS),
    new Date(now.getTime() - 10 * DAY_MS),
    new Date(now.getTime() - 40 * DAY_MS),
  );
  // Amir: an assigned package awaiting the consumer's demo checkout.
  await createAssignment(
    amir,
    plans.VIP,
    packages.VIP[30],
    now,
    new Date(now.getTime() + 30 * DAY_MS),
    null,
  );

  const today = nowInTimezone(timezone).date;
  const booking = (date: string, start: string, minutes: number, price: number) => ({
    clubId,
    locationId: lakeside.id,
    courtId: court1.id,
    userId: lena.id,
    userMembershipId: lenaAssignment.id,
    date,
    startMinute: t(start),
    endMinute: t(start) + minutes,
    durationMinutes: minutes,
    price,
    pricingModel: PricingModel.MEMBERSHIP_BASED,
    membershipId: plans.Premium.id,
    membershipName: 'Premium',
    status: BookingStatus.CONFIRMED,
  });
  await m.insert(Booking, [
    booking(addDays(today, 2), '18:00', 60, packages.Premium[60].pricePerBooking),
    booking(addDays(today, 3), '07:00', 60, packages.Premium[60].pricePerBooking),
  ]);
}

// ---------------------------------------------------------------------------
async function main() {
  const reset = process.argv.includes('--reset');
  if (reset && process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset a production database');
  }

  await dataSource.initialize();
  try {
    if (reset) {
      const tables = dataSource.entityMetadatas.map((e) => `"${e.tableName}"`).join(', ');
      await dataSource.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
      console.log('All tables emptied.');
    }

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const adminEmail = (process.env.PLATFORM_ADMIN_EMAIL ?? 'admin@platform.com').toLowerCase();
    const adminPassword = process.env.PLATFORM_ADMIN_PASSWORD ?? 'Admin@12345';

    await dataSource.transaction(async (m) => {
      if (!(await m.existsBy(User, { role: UserRole.PLATFORM_ADMIN }))) {
        await makeUser(m, null, 'Platform Admin', adminEmail, UserRole.PLATFORM_ADMIN, await bcrypt.hash(adminPassword, 10));
        console.log('Platform admin created.');
      }

      if (await m.existsBy(Tenant, { slug: 'downtown-sports' })) console.log('downtown-sports already exists, skipped.');
      else await seedShiftClub(m, passwordHash);

      if (await m.existsBy(Tenant, { slug: 'lakeside-racquet' })) console.log('lakeside-racquet already exists, skipped.');
      else await seedMembershipClub(m, passwordHash);
    });

    console.log(`
Seed finished. Every demo account uses the password: ${DEMO_PASSWORD}

  Platform admin   (no clubSlug)         ${adminEmail}   (password from .env)

  downtown-sports  (SHIFT_BASED, Asia/Kolkata)
    club admin     admin@downtown.com
    consumers      aisha@downtown.com, omar@downtown.com

  lakeside-racquet (MEMBERSHIP_BASED, Asia/Dubai)
    club admin     admin@lakeside.com
    consumers      lena@lakeside.com (active Premium, demo receipt),
                   sam@lakeside.com (expired Basic history),
                   amir@lakeside.com (assigned VIP, awaiting demo checkout)
`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
