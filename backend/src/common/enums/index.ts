/**
 * Shared string enums persisted in the database and used across request DTOs,
 * domain entities, and authorization/pricing logic.
 */
/** The pricing strategy selected for a club when the club is created. */
export enum PricingModel {
  SHIFT_BASED = 'SHIFT_BASED',
  MEMBERSHIP_BASED = 'MEMBERSHIP_BASED',
}

/** Account roles that determine available application operations. */
export enum UserRole {
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  CLUB_ADMIN = 'CLUB_ADMIN',
  CONSUMER = 'CONSUMER',
}

/** Terminal lifecycle state recorded for a court booking. */
export enum BookingStatus {
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}
