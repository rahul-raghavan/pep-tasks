import { test as setup, expect } from '@playwright/test';

interface TestUser {
  email: string;
  name: string;
  role: string;
}

const ADMIN_USER: TestUser = {
  email: 'priya@pepschoolv2.com',
  name: 'Priya Sharma',
  role: 'admin',
};

const STAFF_USER: TestUser = {
  email: 'amit@pepschoolv2.com',
  name: 'Amit Patel',
  role: 'staff',
};

async function devLogin(
  request: import('@playwright/test').APIRequestContext,
  context: import('@playwright/test').BrowserContext,
  user: TestUser
) {
  const res = await request.post('/api/auth/dev-login', {
    data: { email: user.email, name: user.name, role: user.role },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.ok).toBeTruthy();

  // Transfer cookies from API request context to browser context
  const state = await request.storageState();
  if (state.cookies.length > 0) {
    await context.addCookies(
      state.cookies.map((c) => ({
        ...c,
        domain: 'localhost',
        secure: false,
      }))
    );
  }
}

setup('authenticate as admin (Priya)', async ({ request, browser }) => {
  const context = await browser.newContext();

  await devLogin(request, context, ADMIN_USER);

  const page = await context.newPage();
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });

  await context.storageState({ path: 'e2e/auth/storageState.admin.json' });
  await context.close();
});

setup('authenticate as staff (Amit)', async ({ request, browser }) => {
  const context = await browser.newContext();

  await devLogin(request, context, STAFF_USER);

  const page = await context.newPage();
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });

  await context.storageState({ path: 'e2e/auth/storageState.staff.json' });
  await context.close();
});
