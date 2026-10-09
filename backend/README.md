# Backend API

NestJS, TypeORM, and PostgreSQL API for the Club Management multi-tenant SaaS.
The backend owns authentication, club scoping, availability, pricing, bookings,
membership packages, and booking-credit enforcement.

## Setup

Requirements: Node.js 20+ and PostgreSQL 14+.

1. Create a PostgreSQL database.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env.local` and set the database connection, JWT
   secrets, CORS origins, and platform admin credentials.
4. Apply database migrations with `npm run migration:run`.
5. Optionally load the sample clubs with `npm run seed`.
6. Start in watch mode with `npm run start:dev`.

The API defaults to `http://localhost:3000`; interactive Swagger documentation
is served at `/docs`.

## Database workflow

TypeORM synchronization is disabled. The migration source is consolidated into
one file: `src/database/migrations/1791442532556-InitialSchema.ts`. It exports
the ordered migration classes with their original names. Keeping those names
lets existing databases recognize migrations they already applied, while a
fresh database receives the schema in order.

| Command | Purpose |
|---|---|
| `npm run migration:run` | Apply migrations not yet recorded in this database |
| `npm run migration:show` | Show migration status |
| `npm run migration:generate -- src/database/migrations/Name` | Generate a migration from entity changes |
| `npm run migration:revert` | Revert the most recently applied migration |
| `npm run seed` | Add demo data; existing demo Club IDs are skipped |
| `npm run seed:reset` | Clear app tables and load the demo data again |

`seed:reset` is intended for development data. It clears existing application
rows before reseeding; it does not drop the schema or migration history.

For future schema changes, generate the migration as usual, then move its
exported class into the consolidated migration source file and remove the
standalone generated file. Keep the generated class name and timestamp intact;
already applied migration names must not be renamed.

## Demo seed data

Demo account password: `Demo@12345` (platform admin password is read from the
environment).

| Club | Role | Email | Seed state |
|---|---|---|---|
| `downtown-sports` | Club Admin | `admin@downtown.com` | Shift-based club |
| `downtown-sports` | Consumer | `aisha@downtown.com` | Upcoming and past bookings |
| `downtown-sports` | Consumer | `omar@downtown.com` | Upcoming and cancelled bookings |
| `lakeside-racquet` | Club Admin | `admin@lakeside.com` | Membership-based club |
| `lakeside-racquet` | Consumer | `lena@lakeside.com` | Active Premium package and simulated receipt |
| `lakeside-racquet` | Consumer | `sam@lakeside.com` | Expired Basic package history |
| `lakeside-racquet` | Consumer | `amir@lakeside.com` | VIP assignment awaiting demo checkout |

Membership seed data contains packages for 30, 60, and 90-minute bookings,
each with 30-day validity and 24 included bookings. Package fees are numeric
values computed from rate per booking multiplied by quota. Demo payment rows
are simulated records; they do not represent money collected.

## Membership package rules

- Club Admins create memberships and their package options, then assign a
  package to an already registered consumer in the club context.
- A package defines validity days, booking duration, included booking quota,
  and rate per booking. The backend computes its fee; currency symbols are a
  UI concern.
- Each consumer may have one current assignment per club. A renewal is allowed
  when five or fewer days remain; it starts after the current package and has a
  fresh quota.
- Only confirmed bookings consume quota. A cancellation more than 30 minutes
  before start restores the credit; cancellation within 30 minutes is rejected.
- Consumer demo checkout changes the assignment to eligible and creates a
  printable `SIMULATED_PAID` receipt. There is no payment gateway and no real
  money collection.
- Booking and membership history is scoped by the authenticated club and user.

## Useful scripts

```bash
npm run start:dev
npm run build
npm run test
npm run test:e2e
npm run test:isolation
```

See the [root README](../README.md), [ERD](../docs/erd.md),
[architecture](../docs/architecture.md), [progress log](../docs/progress-log.md),
and the generated [OpenAPI specification](../docs/openapi.json).
