import { defineConfig } from '@playwright/test';
const cwd = __dirname;
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    browserName: 'chromium',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  webServer: [
    {
      command: 'npm run start -w @lee/api',
      cwd,
      url: 'http://127.0.0.1:3100/api/health',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run preview -w @lee/web -- --port 5174',
      cwd,
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
