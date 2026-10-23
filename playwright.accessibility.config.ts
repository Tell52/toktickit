import { defineConfig } from '@playwright/test';
import common from './playwright.actions.config';
export default defineConfig({ ...common, testMatch: 'ui-accessibility.spec.ts',
  outputDir: 'test-results/lab4-ui-accessibility-browser',
  reporter: [['list'], ['junit', { outputFile: 'test-results/lab4-ui-accessibility-browser.xml' }]],
});
