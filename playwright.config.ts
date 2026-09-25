import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'chromium-mobile',
      testIgnore: /chromium\.spec\.ts$/,
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
    { name: 'webkit-mobile', testIgnore: /chromium\.spec\.ts$/, use: { ...devices['iPhone 13'] } },
  ],
  webServer: [
    {
      command: 'npm run preview --workspace @family-calendar/web -- --outDir dist-test',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command:
        'npm run preview --workspace @family-calendar/web -- --outDir dist-auth-test --port 4175',
      url: 'http://127.0.0.1:4175',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
