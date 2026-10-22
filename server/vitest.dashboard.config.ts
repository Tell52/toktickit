import { defineConfig } from 'vitest/config';
if (!process.env.LAB4_DASHBOARD_DATABASE_URL) throw new Error('Set LAB4_DASHBOARD_DATABASE_URL to a disposable PostgreSQL server with database-creation privileges.');
export default defineConfig({ test: { environment: 'node', include: ['tests/lab-04/requester-dashboard.api.test.ts', 'tests/lab-04/staff-dashboard.api.test.ts', 'tests/lab-04/dashboard-calculations.test.ts'], fileParallelism: false } });
