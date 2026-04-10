import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // REQUIRED: forces sequential project execution so all browsers share the
              // in-memory DB without race conditions
  use: {
    baseURL: 'http://localhost:3001', // server serves built client in production mode
    headless: true,
  },
  webServer: {
    command: 'npm run build && npm start',
    url: 'http://localhost:3001/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      PORT: '3001',
      DB_PATH: ':memory:',
      NODE_ENV: 'production', // REQUIRED: makes server/index.js serve client/dist static files
    },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox',  use: { browserName: 'firefox'  } },
    // Safari/WebKit omitted — not available on Linux CI environments
  ],
});
