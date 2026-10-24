import { defineConfig } from '@playwright/test';
import common from './playwright.actions.config';

// Legacy fixture helpers also use DATABASE_URL. Keep them on the same explicitly
// opted-in disposable database as the real UI server, even with a local .env.
process.env.DATABASE_URL = process.env.LAB4_UI_DATABASE_URL;

// Run legacy and Sprint 4 journeys together against the same disposable seed.
export default defineConfig({ ...common, testDir: './e2e', testMatch: '**/*.spec.ts',
  outputDir: 'test-results/lab4-regression-browser',
  reporter: [['list'], ['junit', { outputFile: 'test-results/lab4-regression-browser.xml' }]],
});
