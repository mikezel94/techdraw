import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Simulate a returning user: the onboarding tour is marked as seen so
        // the overlay stays out of every spec. First-visit behavior is covered
        // in onboarding.spec.ts, which overrides this with a fresh state.
        storageState: {
          cookies: [],
          origins: [
            {
              origin: 'http://localhost:5173',
              localStorage: [{ name: 'techdraw-onboarded', value: 'seen' }],
            },
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
});
