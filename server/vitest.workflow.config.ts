import { defineConfig } from 'vitest/config';
if (!process.env.LAB4_WORKFLOW_DATABASE_URL) throw new Error('Set LAB4_WORKFLOW_DATABASE_URL to a disposable PostgreSQL server with database-creation privileges.');
export default defineConfig({ test: { environment: 'node', include: ['tests/lab-04/ticket-workflow.api.test.ts'] } });
