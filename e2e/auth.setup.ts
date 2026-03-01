import { test as setup, expect, request as playwrightRequest } from '@playwright/test';

interface TestUser {
  email: string;
  name: string;
  role: string;
}

const SUPER_ADMIN_USER: TestUser = {
  email: 'testrahul@pepschoolv2.com',
  name: 'Test Rahul',
  role: 'super_admin',
};

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

async function loginAndSaveState(
  browser: import('@playwright/test').Browser,
  user: TestUser,
  storageStatePath: string
) {
  // Fresh API context per login — avoids stale cookie accumulation
  const apiCtx = await playwrightRequest.newContext({
    baseURL: 'http://localhost:3000',
  });

  // Retry up to 3 times — Supabase can rate-limit rapid magic link generation
  let res: import('@playwright/test').APIResponse | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await apiCtx.post('/api/auth/dev-login', {
      data: { email: user.email, name: user.name, role: user.role },
    });
    if (res.ok()) break;
    // Wait before retrying
    await new Promise((r) => setTimeout(r, 2000));
  }
  expect(res!.ok()).toBeTruthy();
  const body = await res!.json();
  expect(body.ok).toBeTruthy();

  // Transfer cookies to a browser context
  const state = await apiCtx.storageState();
  const context = await browser.newContext();
  if (state.cookies.length > 0) {
    await context.addCookies(
      state.cookies.map((c) => ({
        ...c,
        domain: 'localhost',
        secure: false,
      }))
    );
  }

  // Verify the dashboard loads
  const page = await context.newPage();
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });

  await context.storageState({ path: storageStatePath });
  await context.close();
  await apiCtx.dispose();
}

setup('authenticate as super_admin (Test Rahul)', async ({ browser }) => {
  await loginAndSaveState(browser, SUPER_ADMIN_USER, 'e2e/auth/storageState.super_admin.json');
});

setup('authenticate as admin (Priya)', async ({ browser }) => {
  await loginAndSaveState(browser, ADMIN_USER, 'e2e/auth/storageState.admin.json');
});

setup('authenticate as staff (Amit)', async ({ browser }) => {
  await loginAndSaveState(browser, STAFF_USER, 'e2e/auth/storageState.staff.json');
});
