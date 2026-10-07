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