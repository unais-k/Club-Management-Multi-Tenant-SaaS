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

  const redisUrl = config.REDIS_URL;
  if (config.NODE_ENV === 'production' && !redisUrl) {
    throw new Error(
      'REDIS_URL is required in production for shared rate limiting',
    );
  }
  if (redisUrl) {
    try {
      const parsed = new URL(String(redisUrl));
      if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:')
        throw new Error();
    } catch {
      throw new Error('REDIS_URL must be a valid redis:// or rediss:// URL');
    }
  }

  return config;
}
