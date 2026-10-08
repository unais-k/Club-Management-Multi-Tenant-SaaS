import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

// Same priority as the app: .env.local > .env.<NODE_ENV> > .env
// dotenv never overrides a value that is already set, so the first file wins
for (const file of ['.env.local', `.env.${process.env.NODE_ENV ?? 'development'}`, '.env']) {
  config({ path: file });
}

// Used only by the CLI (migrations and seed). Run commands from the /backend folder.
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});