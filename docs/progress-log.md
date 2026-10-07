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