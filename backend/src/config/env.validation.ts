/** Environment keys required before the backend can connect and issue JWTs. */
const REQUIRED = [
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_NAME',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
];

// Runs once at startup: a wrong setup stops the app with a clear message
/**
 * Validates required database/JWT configuration and rejects weak or reused JWT secrets.
 * @param config Environment variables supplied by Nest ConfigModule.
 * @returns The same config object after validation, for ConfigModule to expose.
 * @throws Error naming missing values or invalid access/refresh secret configuration.
 */
export function validateEnv(config: Record<string, unknown>) {
  const missing = REQUIRED.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing environment variables: ${missing.join(', ')}. Copy .env.example and fill it in.`,
    );
  }

  const access = String(config.JWT_ACCESS_SECRET);
  const refresh = String(config.JWT_REFRESH_SECRET);
  if (access.length < 32 || refresh.length < 32) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be at least 32 characters',
    );
  }
  if (access === refresh) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different',
    );
  }

  return config;
}
