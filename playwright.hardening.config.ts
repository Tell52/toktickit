import { defineConfig } from '@playwright/test';
import common from './playwright.actions.config';

// All Labs 2–4 share the explicitly selected disposable UI database/server.
export default defineConfig({ ...common, testDir: './e2e', testMatch: '**/*.spec.ts',
  outputDir: 'test-results/lab4-security-all-browser',
  reporter: [['list'], ['junit', { outputFile: 'test-results/lab4-security-all-browser.xml' }]],
});
