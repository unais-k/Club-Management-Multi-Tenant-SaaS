# Club Management: Multi-Tenant SaaS

A multi-tenant platform for managing sports clubs: a platform admin manages clubs, each club manages its locations, courts, pricing, memberships and bookings, and consumers book courts.

| Part | Stack | Folder |
|---|---|---|
| API | NestJS, TypeORM, PostgreSQL | `/backend` |
| Admin panel (platform admin + club admin) | React, Vite, Tailwind CSS | `/admin` |
| Consumer website | Next.js, TypeScript | `/web` |

Docs: [ERD](docs/erd.md), [Architecture](docs/architecture.md), [OpenAPI](docs/openapi.json), [Progress log](docs/progress-log.md)

## Setup (backend)
Requirements: Node 20+, PostgreSQL 14+.

1. Create the database: `CREATE DATABASE club_management;`
2. `cd backend` then `npm install`
3. Copy `.env.example` to `.env.local` and fill it in (table below)
4. Create the tables: `npm run migration:run`
5. (Optional) Load demo data: `npm run seed`
6. Start: `npm run start:dev`. API at http://localhost:3000, Swagger at http://localhost:3000/docs

### Environment variables
| Variable | Meaning |
|---|---|
| PORT | API port (3000) |
| CORS_ORIGINS | Comma-separated browser origins allowed to call the API |
| DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME | PostgreSQL connection |
| JWT_ACCESS_SECRET, JWT_REFRESH_SECRET | Two different secrets, at least 32 characters |
| JWT_ACCESS_EXPIRES_SECONDS, JWT_REFRESH_EXPIRES_SECONDS | Token lifetimes (900 and 604800) |
| PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD | The platform admin created on first start |
| THROTTLE_DISABLED | `true` turns off rate limiting (tests only) |

Files load in this order, and the first file that defines a variable wins: `.env.local`, `.env.development`, `.env`.

### Database commands
| Command | What it does |
|---|---|
| `npm run migration:run` | Apply pending migrations |
| `npm run migration:generate -- src/database/migrations/Name` | Create a migration from entity changes |
| `npm run migration:revert` | Undo the last migration |
| `npm run seed` | Add the demo data (skips what exists) |
| `npm run seed:reset` | Clear app tables, then load the demo data |

The ordered TypeORM migrations are stored in one source file,
`backend/src/database/migrations/1791442532556-InitialSchema.ts`. Each migration
class retains its original name so databases that already recorded the earlier
migrations continue to recognize them. Run `npm run migration:run` from
`backend`; it applies only migrations not yet recorded by that database.
`seed:reset` clears existing application data before creating the demo clubs.

### Demo accounts (after `npm run seed`)
All demo users have the password `Demo@12345`.

| Who | clubSlug | Email |
|---|---|---|
| Platform admin | (none) | value of PLATFORM_ADMIN_EMAIL |
| Downtown admin (shift-based club) | downtown-sports | admin@downtown.com |
| Downtown consumers | downtown-sports | aisha@downtown.com, omar@downtown.com |
| Lakeside admin (membership-based club) | lakeside-racquet | admin@lakeside.com |
| Lakeside consumers | lakeside-racquet | lena@lakeside.com (active Premium), sam@lakeside.com (expired Basic), amir@lakeside.com (VIP awaiting demo checkout) |

### Tests
- `npm run test`: unit tests (availability engine, pricing, dates)
- `npm run test:isolation`: tenant isolation checks against the running API
- `node scripts/race-test.mjs ...`: fires parallel requests for one slot (exactly one succeeds)

## Architecture
See [docs/architecture.md](docs/architecture.md) and [docs/erd.md](docs/erd.md).

## Design decisions
- **Tenant isolation:** shared tables with `clubId`; the club comes from the token, never from input; every query filters by it; other clubs get 404.
- **Authentication:** bcrypt passwords; 15-minute access JWT; 7-day refresh JWT whose SHA-256 hash is stored and rotated on every use (reuse ends the session); the DB user is loaded on each request, so deactivation applies at once; registration creates consumers only.
- **Rate limiting:** Nest Throttler uses its built-in in-memory storage. Redis is not used; counters are local to each backend process and reset when it restarts.
- **Pricing model is fixed after creation.** Changing it would invalidate existing prices and bookings, so it is chosen when the club is created and cannot be edited.
- **Duration validation:** locations own the durations; courts may only use a subset; the service rejects anything else (400), and location edits that would orphan a court are blocked (409).
- **Court hours vs location hours:** a court's hours must lie inside the location's merged opening hours; the availability engine also intersects them as a safety net.
- **Availability:** one pure, unit-tested engine: (location hours ∩ court hours) − unavailable periods − bookings. The availability screen and the booking API share it, so they cannot disagree.
- **Shift pricing:** time outside shifts uses the Normal price. A booking that crosses shifts is prorated by minutes (08:30-09:30 across a 09:00 boundary = half at each rate).
- **Membership packages:** the Club Admin creates validity/duration/quota packages and assigns one to a registered consumer. One current assignment per consumer per club; renewals are allowed when 5 or fewer days remain and start after the current package. Quota is fresh and does not carry over.
- **Membership bookings:** the assigned active package determines the booking rate and consumes one credit. Cancellation more than 30 minutes before start restores the credit; cancellation within 30 minutes is rejected.
- **Demo checkout:** consumers can confirm a simulated package payment to activate an assignment and get a printable receipt. No money is collected and no payment provider is connected. Booking receipts are printable too.
- **No double bookings (3 layers):** shared validation, a row lock on the court inside a transaction, and a PostgreSQL exclusion constraint. Verified by a parallel-request script.
- **Bookings keep a price snapshot** and are cancelled, never deleted.
- **Time model:** minutes from midnight, `HH:mm` in the API, dates and "now" in the club's timezone.
- **Migrations** manage the schema (`synchronize` is off).
- **Errors** always use one shape: `{ statusCode, error, message, errors?, path, timestamp }`.

## Assumptions
- Amounts are stored as numeric values; the UI displays `$`. Demo checkout records a simulated payment only; there is no payment gateway or real payment collection.
- Shifts apply to every day of the week; bookings cannot cross midnight.
- Slot start times follow a grid (GCD of the location's durations); bookings are allowed up to 60 days ahead.
- Membership validity is checked when booking, not on the play date.

## Known limitations
- `clubId` on child tables is set by the service layer; the database does not enforce it with composite foreign keys.
- Changing opening hours, court hours or durations does not re-check existing bookings (only courts are checked).
- One refresh token per user (a new login replaces the old session); access tokens stay valid until expiry after logout.
- Availability is computed per request (no caching); no real payment processing, refunds or payment reconciliation.
- Rate limits are not shared between multiple backend processes and reset on restart because throttling is in memory.
