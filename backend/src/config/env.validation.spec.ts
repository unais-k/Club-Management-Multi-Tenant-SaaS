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

describe('validateEnv', () => {
  it('accepts valid required configuration without Redis in every environment', () => {
    expect(
      validateEnv({ ...validConfig, NODE_ENV: 'development' }),
    ).toMatchObject(validConfig);
    expect(
      validateEnv({ ...validConfig, NODE_ENV: 'production' }),
    ).toMatchObject(validConfig);
  });
});
