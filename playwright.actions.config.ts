import { defineConfig, devices } from '@playwright/test';

if (!process.env.LAB4_UI_DATABASE_URL) throw new Error('Set LAB4_UI_DATABASE_URL to a migrated disposable database; never use the working database.');
export default defineConfig({
  testDir: './e2e/lab-04', testMatch: ['actions-taken-flow.spec.ts', 'ticket-resolution.spec.ts', 'requester-dashboard.spec.ts'], workers: 1,
  timeout: 60000, forbidOnly: !!process.env.CI,
  reporter: [['list'], ['junit', { outputFile: 'test-results/lab4-actions-browser.xml' }]],
  outputDir: 'test-results/lab4-actions-browser',
  use: { baseURL: 'http://localhost:5173', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    { command: 'node node_modules/tsx/dist/cli.mjs src/index.ts', cwd: './server', url: 'http://localhost:3106/api/health', reuseExistingServer: false,
      env: { DATABASE_URL: process.env.LAB4_UI_DATABASE_URL, PORT: '3106', SESSION_SECRET: 'lab4-ui-disposable-test-only', NODE_ENV: 'test' } },
    { command: 'node node_modules/vite/bin/vite.js --host localhost --port 5173 --strictPort', cwd: './client', url: 'http://localhost:5173', reuseExistingServer: false,
      env: { VITE_API_URL: 'http://localhost:3106' } },
  ],
});
