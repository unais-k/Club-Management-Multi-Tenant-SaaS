# Progress Log

## Step 1: Project setup

**Goal:** Create the monorepo structure and the NestJS backend skeleton.

**Structure:** /backend (NestJS), /admin (React + Vite), /web (Next.js), /docs

**Commands:**

- `nest new backend --skip-git`
- `npm run start:dev`

**Key concepts:** Module, Controller, Service. Flow is Request → Controller → Service → DB.

**Decisions:** Separate apps in one repo (monorepo) for easy review.

## Step 2: Database, config, validation, Swagger

**Goal:** Connect NestJS to MySQL and set up shared app configuration.

**Packages:** @nestjs/config, typeorm, @nestjs/typeorm, mysql2, class-validator, class-transformer, @nestjs/swagger

**What was done:**

- Created `club_management` database (utf8mb4)
- Config via `.env` loaded by global ConfigModule
- TypeORM connection with `autoLoadEntities`
- Global ValidationPipe (whitelist + forbidNonWhitelisted + transform)
- Swagger docs at /docs

**Decisions:**

- TypeORM over Prisma: built-in pessimistic locking for double-booking prevention
- `synchronize: true` in development only; migrations before submission

**Key concepts:** Dependency injection (ConfigService), DTO validation, Swagger.

- Env strategy: `.env.local` (secrets, ignored) > `.env.development` > `.env`; DB_SYNC only true in dev

## Step 2.5: Switched database from MySQL to PostgreSQL

**Reason:** The assessment spec pairs NestJS with PostgreSQL.
**Changes:** `mysql2` → `pg`, TypeORM `type: 'postgres'`, port 5432, `users.clubId` changed to `uuid` to match `tenants.id`.
**Benefit:** Native uuid type, and exclusion constraints for DB-level double-booking protection.

## Step 3: Database design, Tenant and User entities

**Goal:** Define the tenant-isolation strategy and create the first tables.

**Tenant isolation strategy:**

- Shared database and tables; every tenant-owned table has `club_id` (FK to tenants)
- `club_id` is taken from the authenticated user's JWT, never from request input
- All service methods require `clubId` and filter by it; cross-tenant IDs return 404
- Composite indexes start with `club_id`

**Tables created:** `tenants`, `users`

- users: unique (club_id, email); `club_id` NULL only for PLATFORM_ADMIN
- passwordHash and refreshTokenHash use `select: false` so they never leak in responses

**Decisions:**

- UUID primary keys (non-guessable)
- Pricing model stored on tenant and not editable after creation
- ESM note: relations use `Relation<T>` to avoid circular-import errors

## Step 4: Tenants API (Platform Admin)

**Goal:** Let the platform admin create and manage clubs.

**Endpoints:** POST /tenants, GET /tenants, GET /tenants/:id, PUT /tenants/:id, PATCH /tenants/:id/status

**What was done:**

- DTOs with class-validator (slug format, enum, email, password length)
- Pagination DTO in `common/dto` (reused later)
- Creating a tenant also creates its first CLUB_ADMIN user inside one DB transaction
- Passwords hashed with bcrypt
- Duplicate slug returns 409 (pre-check plus handling the DB unique error for race conditions)
- Timezone validated using Intl

**Decisions:**

- Pricing model and slug are immutable after creation (update DTO excludes them; forbidNonWhitelisted returns 400). Changing the model later would invalidate existing prices and bookings.
- Deactivation is a status flag (soft), never a delete, so history is preserved.

**Key concepts:** DTO, Controller, Service, dependency injection, transactions, pipes.

## Step 5: Authentication and Authorization

**Goal:** Secure the API and enforce roles and tenant context.

**Endpoints:** POST /auth/register, /auth/login, /auth/refresh, /auth/logout, GET /auth/me

**Approach:**

- Passwords: bcrypt
- Access token: JWT, 15 min. Refresh token: JWT, 7 days, only a SHA-256 hash is stored
- Refresh rotation: reuse of an old refresh token wipes the session
- Global JwtAuthGuard (secure by default, `@Public()` opts out) + RolesGuard (`@Roles()`)
- Guard loads the user from the DB each request: deactivated users/clubs are blocked immediately and the role is always from the DB
- `@ClubId()` decorator supplies the tenant id from the authenticated user, never from input
- Login uses `clubSlug` because email is unique per club; platform admin logs in without a slug
- Register is consumers-only; the role is fixed on the server (extra body fields are rejected)
- Platform admin seeded on startup from env variables

**Known limitations:** one active session per user (a new login replaces the refresh token); access tokens stay valid until expiry after logout (the DB user check still blocks deactivated users); no rate limiting on login.

## Step 6: Locations

**Goal:** Let club admins manage locations, weekly opening hours, booking durations and unavailable periods, with strict tenant isolation.

**Tables:** locations, location_opening_hours, location_unavailable_periods (all carry club_id)

**Endpoints:** POST/GET/GET:id/PUT/DELETE /locations, PUT /locations/:id/opening-hours, POST/GET/DELETE /locations/:id/unavailable-periods

**Tenant isolation:**

- Every service method receives `clubId` from `@ClubId()` (taken from the authenticated user)
- `getOwned(clubId, id)` filters by both id and club_id; other clubs' ids return 404
- Verified: Club B cannot read, update or delete Club A's locations

**Decisions:**

- Times stored as minutes from midnight (API uses HH:mm); "24:00" allowed as closing time; overnight periods not supported (split across two days)
- dayOfWeek: 0 = Sunday ... 6 = Saturday; closed day = no rows; multiple periods = multiple rows
- Opening hours replaced as a whole set inside a transaction; overlaps and invalid ranges rejected
- Database CHECK constraints guard the time ranges
- Durations stored as an integer array on the location
- Unavailable periods on the same date cannot overlap (409); duration is derived (end - start)
- DELETE is a soft delete so booking history survives; name unique per club among non-deleted rows
- Consumers only see active locations
- All times are in the club's timezone

**Known limitations:** unavailable periods can be created for past dates; the Step 7 courts work will enforce court hours and durations against the location and will block location edits that would break existing courts.

## Step 7: Courts

**Goal:** Manage courts per location with their own availability, while enforcing location rules.

**Tables:** courts, court_opening_hours (both carry club_id)

**Endpoints:** POST/GET /locations/:locationId/courts, GET/PUT/DELETE /courts/:id, PUT /courts/:id/opening-hours

**Rules implemented:**

- Rule 2: every court period must fit inside one merged location period for that day; otherwise 400 with a message naming the day and time
- Rule 4: a court can have its own hours (e.g. 06-12 and 14-23); `useCustomHours` flag; days not listed are closed for that court; otherwise it inherits the location hours
- Rule 5: a court's durations are NULL (all of the location's) or a subset; any duration not offered by the location is rejected at the service level (400)
- Location edits that would leave a court outside its hours or remove a duration it uses are blocked with 409 naming the court
- Deleting a location soft-deletes its courts in one transaction

**Tenant isolation:** every court lookup filters by id AND club_id, and the parent location is verified for the same club; other clubs get 404 (tested).

**Decisions:**

- Custom court hours fully replace the location schedule; touching location periods are merged before comparing
- Consumers only see active courts in active locations
- Court name unique per location among non-deleted courts

**Known limitation:** deleting a court does not yet check for future bookings (added when bookings exist).

## Step 8: Pricing, shift-based

**Goal:** Let SHIFT_BASED clubs define pricing shifts and per-court prices, and calculate booking prices.

**Tables:** pricing_shifts, court_prices (both carry club_id)

**Endpoints:** POST /pricing/shifts, GET /pricing/locations/:locationId/shifts, PUT/DELETE /pricing/shifts/:id, PUT/GET /pricing/courts/:courtId, GET /pricing/quote

**Rules and validation:**

- Only SHIFT_BASED clubs can create shifts or set court prices (409 otherwise)
- Shifts apply every day; no overlaps within a location; the names "Normal" and "Default" are reserved
- Time outside any shift uses the Normal price (court_prices row with shiftId NULL)
- Court prices: duration must be offered by the court, shift must belong to the same location, no duplicates, price >= 0 with max 2 decimals; DB unique indexes (two partial indexes to handle NULL) and CHECK constraints back this up
- Price list is replaced as a whole in one transaction
- Deleting a shift removes its prices; that time falls back to Normal

**Booking crossing two shifts: prorated by minutes.**
Each part of the booking is charged at the price of its own shift for the full duration, scaled by minutes. Example: 08:30-09:30 (60 min), Morning Peak $20, Normal $15 = $10.00 + $7.50 = $17.50. Calculated in cents to avoid float errors. A missing price returns 422 instead of a free booking.

**Design:** calculation is a pure function (`pricing-calculator.ts`) with unit tests (6 cases), reused by the booking flow. Bookings will store the final price, so later price changes do not alter existing bookings.

**Tenant isolation:** every lookup filters by club_id; other clubs get 404 (tested).

**Known limitations:** no per-day shifts (weekday vs weekend); single currency; overnight bookings not supported; the quote does not check availability (done in the booking step).

## Step 9: Pricing, membership-based

**Goal:** Let MEMBERSHIP_BASED clubs define plans and prices, let consumers subscribe, and price bookings from the consumer's membership.

**Tables:** memberships, membership_prices, user_memberships (all carry club_id)

**Endpoints:** POST/GET/GET:id/PUT/DELETE /memberships, PUT /memberships/:id/prices, POST /memberships/:id/subscribe, GET /me/membership, DELETE /me/membership/:id; GET /pricing/quote now handles both pricing models

**Edge cases (decisions):**

- No membership: no price, 422 "active membership required" (the plans and prices stay visible so the consumer can choose one)
- Expired membership: same as no membership; status is calculated (ACTIVE / EXPIRED / CANCELLED), never stored
- Plan without a price for the duration: that plan is skipped; if no active plan has one, 422 naming the duration
- Multiple memberships: allowed (upgrades); the cheapest applicable price wins, a tie goes to the later expiry; subscribing to the same plan twice while active returns 409

**Rules:**

- Only MEMBERSHIP_BASED clubs can create plans or prices; shift clubs get an empty plan list
- Price durations must be offered by at least one location; no duplicates; price >= 0 with max 2 decimals; prices replaced as a whole in a transaction; DB unique index and CHECK constraints
- Consumers only see active plans that have prices; admins see missingDurations
- Deactivating a plan keeps existing subscriptions; deleting is soft and blocked while anyone holds the plan
- Subscribing takes a row lock on the user inside a transaction to prevent duplicate parallel subscriptions
- Membership validity is checked at booking time, not on the play date; cancelling ends the membership immediately (no payments or refunds)
- `MembershipsService.resolvePrice` is shared: the quote uses it now and bookings will use it in Step 10

**Tenant isolation:** every lookup filters by club_id; other clubs get 404 (tested).

**Known limitations:** no payment gateway; no renewal or auto-renewal flow (subscribe again after expiry); membership validity not checked against the play date; prices are not per court or per location.

## Step 10 (part 1): Availability engine

**Goal:** Implement the core scheduling rules as pure, unit-tested functions, shared by the availability screen and the booking validation.

**How it works:** all times are minute ranges, half-open [start, end). For one court and date:
free time = (location hours ∩ court hours) − location unavailable periods − existing bookings.
A slot is bookable only if the whole range lies inside one free window.

**Functions:** `computeFreeWindows`, `generateSlots`, `findBlockingReason`, `slotStep` (in `availability/availability-engine.ts`)

**Decisions:**

- Court hours are always intersected with location hours (Rule 2 is also enforced here as a safety net)
- Touching location periods are merged (a booking can cross 12:00 when 06-12 and 12-14 are both open); a real gap cannot be crossed
- Adjacent ranges do not conflict (10-11 booked, 11-12 allowed); partial overlap does (10:30-11:30 rejected)
- Slot starts are clock-aligned on a grid equal to the GCD of the location's durations (30,60,90,120 → every 30 minutes)
- `earliestStart` lets the service hide slots that already passed
- Blocking reasons, in order: OUTSIDE_LOCATION_HOURS, OUTSIDE_COURT_HOURS, LOCATION_UNAVAILABLE, ALREADY_BOOKED
- The slot list and the blocking check are tested to always agree, so the UI can never show a slot the booking API rejects

**Tests:** ~25 unit tests (vitest) including the spec's examples.

**Known limitations:** overnight ranges are not supported; slot start times are on a fixed grid (a booking can't start at 10:10).

## Step 10 (part 2): Bookings table and GET /availability

**Goal:** Serve bookable slots with prices per court, using the availability engine.

**Table:** bookings (club_id, location, court, user, date, start/end minute, duration, price snapshot, pricing model, plan snapshot, status, cancelled_at). Partial index on (court_id, date) for CONFIRMED rows; CHECK constraints on range, duration and price.

**Endpoint:** GET /availability?locationId&date&durationMinutes[&membershipId]

**Flow:** load club, location (with hours), courts (with hours), unavailable periods and confirmed bookings of the date, then run the engine per court. About 7 queries per request regardless of the number of slots.

**Rules:**

- Date and "now" use the club's timezone; today shows only slots from the current minute; max 60 days ahead; past dates are rejected (400)
- Duration must be offered by the location; courts that do not offer it are omitted; inactive courts omitted; inactive location is a 404 for consumers
- A closed day returns empty slots and a notice (not an error)
- Shift-based: price per slot, prorated across shifts with a breakdown; a missing price gives price null with a note
- Membership-based: one price for all slots, resolved once from the consumer's membership; no membership gives null with a note (browsing still works); admins preview with membershipId
- `PricingService.createPricer` loads shifts and court prices once (no per-slot queries)
- Only CONFIRMED bookings block a court; bookings are cancelled by status and never deleted; they keep a price snapshot

**Tenant isolation:** the location lookup filters by club_id (other clubs get 404); courts, periods and bookings are all filtered by club_id.

**Tests:** date helpers and booking-window unit tests (about 10 more).

**Known limitations:** slot start times follow a fixed grid; the 60-day window is a constant; the availability response is computed on every request (no caching).

## Step 11: Bookings and double-booking protection

**Goal:** Let consumers book courts safely, and make overlapping bookings impossible.

**Endpoints:** POST /bookings, GET /bookings, GET /bookings/:id, PATCH /bookings/:id/cancel

**Booking flow (POST /bookings):**

1. Tenant-checked court and location (inactive = not found); duration offered by the court; end by 24:00; start on the slot grid; date rules (club timezone, not in the past, max 60 days)
2. Price calculated on the server (shift proration or membership); optional `expectedPrice` returns 409 if the price changed
3. Transaction: lock the court row (SELECT ... FOR UPDATE), read unavailable periods and existing bookings under the lock, run `findBlockingReason` (the same engine as GET /availability), insert

**Preventing double bookings (3 layers):**

1. Validation with the shared availability engine
2. Pessimistic row lock per court inside a transaction (bookings for one court are serialized; the second request gets a clear 409)
3. PostgreSQL exclusion constraint `EXCL_bookings_no_overlap` (btree_gist: same court + same date + overlapping minute range, only for CONFIRMED rows); a violation (23P01) is mapped to 409
   Verified with a script that fires 10-20 identical requests at once: exactly one succeeds.

**Error codes:** 400 invalid input, 404 not found (also other clubs), 409 slot taken or price changed, 422 closed/unavailable/no price or membership.

**Other rules:**

- Bookings store a price snapshot (price, pricing model, plan name); cancelled, never deleted; only CONFIRMED rows block a court
- Cancel is allowed until the start time (atomic UPDATE ... WHERE status = CONFIRMED); admins can cancel any booking of their club
- Consumers see only their own bookings; admins see the whole club's, with user details; filters: status, period (upcoming = not ended), location, court, date range; history keeps names of deleted courts and locations
- A court or location with upcoming bookings cannot be deleted (409); an unavailable period cannot be added over confirmed bookings (409)

**Tenant isolation:** every booking query filters by club_id; consumers additionally by user_id.

**Known limitations:** opening hours are read just before the lock (admin config edited in that instant is not seen); changing opening hours, court hours or durations does not re-check existing bookings; a consumer can hold overlapping bookings on different courts; no payment step; no cancellation deadline or refund rules; the constraint is created at startup (it moves into a migration in the wrap-up).
