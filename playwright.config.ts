import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local so Playwright tests have access to Supabase env vars
function loadEnvFile() {
  try {
    const envPath = resolve(__dirname, '.env.local');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx);
      const value = trimmed.slice(eqIdx + 1);
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local might not exist in CI
  }
}
loadEnvFile();

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    // Auth setup — runs first, saves session cookies for both users
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },

    // Admin tests — logged in as Priya (admin)
    {
      name: 'admin-tests',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/auth/storageState.admin.json',
      },
      dependencies: ['setup'],
      testIgnore: /staff\//,
    },

    // Staff tests — logged in as Amit (staff)
    {
      name: 'staff-tests',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/auth/storageState.staff.json',
      },
      dependencies: ['setup'],
      testMatch: /staff\/.+\.spec\.ts/,
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
