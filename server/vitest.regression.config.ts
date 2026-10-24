import { defineConfig } from 'vitest/config';

const url = process.env.LAB4_REGRESSION_DATABASE_URL;
if (!url) throw new Error('Set LAB4_REGRESSION_DATABASE_URL to a migrated/seeded disposable database on a server with database-creation privileges.');
process.env.DATABASE_URL = url;
for (const suite of ['ACTIONS', 'WORKFLOW', 'DASHBOARD', 'SECURITY', 'MIGRATION']) {
  process.env[`LAB4_${suite}_DATABASE_URL`] = url;
}
export default defineConfig({ test: { environment: 'node', include: ['tests/**/*.test.ts'], fileParallelism: false } });
