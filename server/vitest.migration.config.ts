import { defineConfig } from 'vitest/config';

if (!process.env.LAB4_MIGRATION_DATABASE_URL) {
  throw new Error('Set LAB4_MIGRATION_DATABASE_URL to a disposable PostgreSQL server; DATABASE_URL is intentionally ignored.');
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/lab-04/migration-regression.test.ts'],
  },
});
