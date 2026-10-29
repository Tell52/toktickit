import { defineConfig } from 'vitest/config';
if (!process.env.LAB4_SECURITY_DATABASE_URL) throw new Error('Set LAB4_SECURITY_DATABASE_URL to a disposable PostgreSQL server with database-creation privileges.');
process.env.LAB4_ACTIONS_DATABASE_URL = process.env.LAB4_SECURITY_DATABASE_URL;
process.env.LAB4_WORKFLOW_DATABASE_URL = process.env.LAB4_SECURITY_DATABASE_URL;
export default defineConfig({ test: { environment: 'node', fileParallelism: false,
  include: ['tests/lab-04/authorization.api.test.ts', 'tests/lab-04/concurrency.api.test.ts', 'tests/lab-04/dashboard-performance.test.ts',
    'tests/lab-04/action-validation.test.ts', 'tests/lab-04/actions-taken.api.test.ts', 'tests/lab-04/ticket-workflow.api.test.ts'],
} });
