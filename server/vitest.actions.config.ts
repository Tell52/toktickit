import { defineConfig } from 'vitest/config';
if (!process.env.LAB4_ACTIONS_DATABASE_URL) throw new Error('Set LAB4_ACTIONS_DATABASE_URL to a disposable PostgreSQL server with database-creation privileges.');
export default defineConfig({ test: { environment: 'node', include: ['tests/lab-04/action-validation.test.ts', 'tests/lab-04/actions-taken.api.test.ts'] } });
