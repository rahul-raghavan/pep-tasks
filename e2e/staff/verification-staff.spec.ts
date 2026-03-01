import { test, expect, request as playwrightRequest } from '@playwright/test';

// We need an admin API context to create and verify tasks, since Amit (staff) can't do that
async function getAdminContext() {
  const ctx = await playwrightRequest.newContext({
    baseURL: 'http://localhost:3000',
  });
  const loginRes = await ctx.post('/api/auth/dev-login', {
    data: {
      email: 'priya@pepschoolv2.com',
      name: 'Priya Sharma',
      role: 'admin',
    },
  });
  expect(loginRes.ok()).toBeTruthy();
  return ctx;
}

// Helper: get user by email
async function getUserByEmail(
  request: import('@playwright/test').APIRequestContext,
  email: string
) {
  const res = await request.get('/api/users');
  const users = await res.json();
  return users.find((u: { email: string }) => u.email === email);
}

test.describe('Staff cannot verify', () => {
  test('no verify button on completed task for staff', async ({
    page,
    request,
  }) => {
    // Create a task via admin context, assigned to Amit
    const adminCtx = await getAdminContext();
    const amit = await getUserByEmail(adminCtx, 'amit@pepschoolv2.com');

    const title = `Staff No Verify ${Date.now()}`;
    let res = await adminCtx.post('/api/tasks', {
      data: { title, priority: 'normal', assigned_to: amit.id },
    });
    expect(res.ok()).toBeTruthy();
    const task = await res.json();

    // Move to completed (as admin)
    res = await adminCtx.patch(`/api/tasks/${task.id}`, {
      data: { status: 'in_progress' },
    });
    expect(res.ok()).toBeTruthy();
    res = await adminCtx.patch(`/api/tasks/${task.id}`, {
      data: { status: 'completed' },
    });
    expect(res.ok()).toBeTruthy();

    // As Amit (staff), visit the task page
    await page.goto(`/tasks/${task.id}`);
    await expect(page.getByText(title)).toBeVisible();

    // Should NOT have a Verify button
    await expect(
      page.getByRole('button', { name: 'Verify' })
    ).not.toBeVisible();

    // Clean up
    await adminCtx.patch(`/api/tasks/${task.id}`, {
      data: { status: 'verified', verification_rating: 5 },
    });
    await adminCtx.dispose();
  });

  test('staff API call to verify is rejected', async ({ request }) => {
    // Create a task via admin context
    const adminCtx = await getAdminContext();
    const amit = await getUserByEmail(adminCtx, 'amit@pepschoolv2.com');

    const title = `Staff API Reject ${Date.now()}`;
    let res = await adminCtx.post('/api/tasks', {
      data: { title, priority: 'normal', assigned_to: amit.id },
    });
    expect(res.ok()).toBeTruthy();
    const task = await res.json();

    // Move to completed (as admin)
    res = await adminCtx.patch(`/api/tasks/${task.id}`, {
      data: { status: 'in_progress' },
    });
    expect(res.ok()).toBeTruthy();
    res = await adminCtx.patch(`/api/tasks/${task.id}`, {
      data: { status: 'completed' },
    });
    expect(res.ok()).toBeTruthy();

    // Try to verify as Amit (staff) — should fail
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'verified', verification_rating: 5 },
    });
    expect(res.ok()).toBeFalsy();
    const err = await res.json();
    expect(err.error).toContain('Only admins can verify');

    // Clean up
    await adminCtx.patch(`/api/tasks/${task.id}`, {
      data: { status: 'verified', verification_rating: 5 },
    });
    await adminCtx.dispose();
  });
});

test.describe('Staff cannot see ratings', () => {
  test('verified task hides star rating from the worker', async ({
    page,
  }) => {
    // Create task assigned to Amit, verify it with a rating (as admin)
    const adminCtx = await getAdminContext();
    const amit = await getUserByEmail(adminCtx, 'amit@pepschoolv2.com');

    const title = `Hidden Rating ${Date.now()}`;
    let res = await adminCtx.post('/api/tasks', {
      data: { title, priority: 'normal', assigned_to: amit.id },
    });
    expect(res.ok()).toBeTruthy();
    const task = await res.json();

    // Move to completed and verify with 3 stars + comment
    res = await adminCtx.patch(`/api/tasks/${task.id}`, {
      data: { status: 'in_progress' },
    });
    expect(res.ok()).toBeTruthy();
    res = await adminCtx.patch(`/api/tasks/${task.id}`, {
      data: { status: 'completed' },
    });
    expect(res.ok()).toBeTruthy();
    res = await adminCtx.patch(`/api/tasks/${task.id}`, {
      data: {
        status: 'verified',
        verification_rating: 3,
        verification_comment: 'Could be better',
      },
    });
    expect(res.ok()).toBeTruthy();

    // As Amit (staff / worker), view the verified task
    await page.goto(`/tasks/${task.id}`);
    await expect(page.getByText('Verified on')).toBeVisible();

    // Should NOT see any filled stars (rating is hidden from worker)
    const filledStars = page.locator('svg.lucide-star[class*="fill-"]');
    await expect(filledStars).toHaveCount(0);

    await adminCtx.dispose();
  });

  test('API hides rating from worker in task response', async ({
    request,
  }) => {
    const adminCtx = await getAdminContext();
    const amit = await getUserByEmail(adminCtx, 'amit@pepschoolv2.com');

    const title = `API Hidden Rating ${Date.now()}`;
    let res = await adminCtx.post('/api/tasks', {
      data: { title, priority: 'normal', assigned_to: amit.id },
    });
    expect(res.ok()).toBeTruthy();
    const task = await res.json();

    // Complete and verify
    res = await adminCtx.patch(`/api/tasks/${task.id}`, {
      data: { status: 'in_progress' },
    });
    expect(res.ok()).toBeTruthy();
    res = await adminCtx.patch(`/api/tasks/${task.id}`, {
      data: { status: 'completed' },
    });
    expect(res.ok()).toBeTruthy();
    res = await adminCtx.patch(`/api/tasks/${task.id}`, {
      data: { status: 'verified', verification_rating: 4 },
    });
    expect(res.ok()).toBeTruthy();

    // Fetch as Amit (staff / worker)
    res = await request.get(`/api/tasks/${task.id}`);
    expect(res.ok()).toBeTruthy();
    const taskData = await res.json();

    // verification_rating should be null (hidden from worker)
    expect(taskData.verification_rating).toBeNull();

    // Individual verification ratings should also be null
    for (const v of taskData.verifications) {
      expect(v.rating).toBeNull();
    }

    await adminCtx.dispose();
  });
});
