# Database design (PostgreSQL)

## Entity relationship diagram

```mermaid
erDiagram
    tenants ||--o{ users : "club"
    tenants ||--o{ locations : "club"
    locations ||--o{ location_opening_hours : has
    locations ||--o{ location_unavailable_periods : has
    locations ||--o{ courts : has
    courts ||--o{ court_opening_hours : "custom hours"
    locations ||--o{ pricing_shifts : has
    courts ||--o{ court_prices : has
    pricing_shifts |o--o{ court_prices : "NULL = Normal"
    memberships ||--o{ membership_prices : has
    memberships ||--o{ membership_packages : offers
    users ||--o{ user_memberships : holds
    memberships ||--o{ user_memberships : "plan"
    membership_packages |o--o{ user_memberships : assigned
    user_memberships ||--o| membership_payments : receipt
    user_memberships |o--o{ bookings : consumes
    users ||--o{ membership_payments : has
    users ||--o{ bookings : makes
    courts ||--o{ bookings : "booked court"
    locations ||--o{ bookings : "at"

    tenants {
        uuid id PK
        string name
        string slug UK
        enum pricingModel "SHIFT_BASED or MEMBERSHIP_BASED, never changes"
        boolean isActive
        string timezone
    }
    users {
        uuid id PK
        uuid clubId FK "NULL only for PLATFORM_ADMIN"
        string email "unique per club"
        string passwordHash "bcrypt"
        enum role "PLATFORM_ADMIN, CLUB_ADMIN, CONSUMER"
        string refreshTokenHash "SHA-256"
        boolean isActive
    }
    locations {
        uuid id PK
        uuid clubId FK
        string name "unique per club"
        string address
        intarray durations "allowed booking minutes"
        boolean isActive
        timestamptz deletedAt "soft delete"
    }
    location_opening_hours {
        uuid id PK
        uuid clubId "tenant key"
        uuid locationId FK
        smallint dayOfWeek "0=Sunday"
        smallint startMinute
        smallint endMinute
    }
    location_unavailable_periods {
        uuid id PK
        uuid clubId "tenant key"
        uuid locationId FK
        date date
        smallint startMinute
        smallint endMinute
        string reason
    }
    courts {
        uuid id PK
        uuid clubId "tenant key"
        uuid locationId FK
        string name "unique per location"
        intarray durations "NULL = all of the location"
        boolean useCustomHours
        boolean isActive
        timestamptz deletedAt "soft delete"
    }
    court_opening_hours {
        uuid id PK
        uuid clubId "tenant key"
        uuid courtId FK
        smallint dayOfWeek
        smallint startMinute
        smallint endMinute
    }
    pricing_shifts {
        uuid id PK
        uuid clubId "tenant key"
        uuid locationId FK
        string name "unique per location"
        smallint startMinute
        smallint endMinute
    }
    court_prices {
        uuid id PK
        uuid clubId "tenant key"
        uuid courtId FK
        uuid shiftId FK "NULL = Normal price"
        int durationMinutes
        numeric price
    }
    memberships {
        uuid id PK
        uuid clubId "tenant key"
        string name "unique per club"
        int validityDays
        boolean isActive
        timestamptz deletedAt "soft delete"
    }
    membership_prices {
        uuid id PK
        uuid clubId "tenant key"
        uuid membershipId FK
        int durationMinutes
        numeric price
    }
    membership_packages {
        uuid id PK
        uuid clubId "tenant key"
        uuid membershipId FK
        int validityDays
        int bookingDurationMinutes
        int includedBookings
        numeric pricePerBooking
        boolean isActive
    }
    user_memberships {
        uuid id PK
        uuid clubId "tenant key"
        uuid userId FK
        uuid membershipId FK
        uuid packageId FK "nullable for legacy rows"
        numeric packageFee "snapshot"
        timestamptz paidAt "NULL until demo checkout confirmation"
        timestamptz startsAt
        timestamptz expiresAt
        timestamptz cancelledAt
    }
    membership_payments {
        uuid id PK
        uuid clubId "tenant key"
        uuid userId FK
        uuid userMembershipId FK UK
        numeric amount
        string status "PENDING or SIMULATED_PAID"
        string method "DEMO or NULL"
        timestamptz paidAt
    }
    bookings {
        uuid id PK
        uuid clubId "tenant key"
        uuid locationId FK
        uuid courtId FK
        uuid userId FK
        uuid userMembershipId FK "nullable for shift bookings"
        date date "club timezone"
        smallint startMinute
        smallint endMinute
        numeric price "snapshot"
        enum status "CONFIRMED or CANCELLED"
        string membershipName "snapshot"
    }
```

## Tenant isolation strategy
- One shared database. Every tenant-owned table has a `clubId` column.
- `users.clubId`, `locations.clubId` are real foreign keys to `tenants`. On the other tables `clubId` is a denormalised, indexed tenant key that the service layer always fills from the verified parent row.
- `clubId` is read from the logged-in user's token (`@ClubId()`), never from the request. Every query filters by it; another club's id returns 404.
- Unique constraints are scoped by club (for example email per club, location name per club).

## Important indexes and constraints
| Table | Index / constraint | Purpose |
|---|---|---|
| users | UNIQUE (clubId, email) | same email allowed in different clubs |
| locations | UNIQUE (clubId, name) WHERE deletedAt IS NULL | name unique per club, soft deletes ignored |
| courts | UNIQUE (clubId, locationId, name) WHERE deletedAt IS NULL | name unique per location |
| location_opening_hours, court_opening_hours | INDEX (clubId, parentId, dayOfWeek); CHECK day 0-6 and 0 <= start < end <= 1440 | fast day lookup, valid ranges |
| pricing_shifts | UNIQUE (clubId, locationId, name); CHECK range | no duplicate names |
| court_prices | UNIQUE (courtId, durationMinutes, shiftId) WHERE shiftId IS NOT NULL; UNIQUE (courtId, durationMinutes) WHERE shiftId IS NULL; CHECK price >= 0 | one price per duration and shift (two indexes because NULLs are distinct) |
| membership_prices | UNIQUE (membershipId, durationMinutes) | one price per duration |
| membership_packages | UNIQUE (membershipId, validityDays, bookingDurationMinutes) WHERE isActive = true; INDEX (clubId, membershipId) | one assignable option for each active package shape |
| user_memberships | INDEX (clubId, userId); INDEX (packageId) | find club member assignments and package history |
| membership_payments | UNIQUE (userMembershipId); INDEX (clubId, userId, createdAt); CHECK amount >= 0 and valid payment state | one demo receipt per assignment and member payment history |
| bookings | EXCLUDE USING gist (courtId =, date =, int4range(startMinute, endMinute) &&) WHERE status = 'CONFIRMED' | the database itself rejects overlapping bookings |
| bookings | partial INDEX (courtId, date) WHERE status = 'CONFIRMED'; INDEX (clubId, locationId, date); INDEX (clubId, userId, date) | availability and "my bookings" queries |
| bookings | INDEX (userMembershipId) | count confirmed bookings against the exact package quota |
