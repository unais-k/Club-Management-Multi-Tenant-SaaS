import { validateEnv } from './env.validation.js';

const validConfig = {
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USERNAME: 'postgres',
  DB_PASSWORD: 'password',
  DB_NAME: 'club_management',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv Redis configuration', () => {
  it('allows Redis to be unset outside production', () => {
    expect(
      validateEnv({ ...validConfig, NODE_ENV: 'development' }),
    ).toMatchObject(validConfig);
  });

  it('requires Redis in production', () => {
    expect(() =>
      validateEnv({ ...validConfig, NODE_ENV: 'production' }),
    ).toThrow('REDIS_URL is required in production for shared rate limiting');
  });

  it('accepts redis and rediss URLs', () => {
    expect(
      validateEnv({
        ...validConfig,
        NODE_ENV: 'production',
        REDIS_URL: 'rediss://cache:6380',
      }),
    ).toMatchObject(validConfig);
  });

  it('rejects unsupported Redis URL protocols', () => {
    expect(() =>
      validateEnv({ ...validConfig, REDIS_URL: 'https://cache.example' }),
    ).toThrow('REDIS_URL must be a valid redis:// or rediss:// URL');
  });
});
