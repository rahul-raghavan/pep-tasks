import { test, expect } from '@playwright/test';

// Helper: create a task as Priya (admin), assigned to a specific user
async function createTask(
  request: import('@playwright/test').APIRequestContext,
  assignedToId: string,
  titlePrefix: string
) {
  const title = `${titlePrefix} ${Date.now()}`;
  const res = await request.post('/api/tasks', {
    data: { title, priority: 'normal', assigned_to: assignedToId },
  });
  expect(res.ok()).toBeTruthy();
  const task = await res.json();
  return { ...task, title };
}

// Helper: move task through statuses to completed
async function moveToCompleted(
  request: import('@playwright/test').APIRequestContext,
  taskId: string
) {
  let res = await request.patch(`/api/tasks/${taskId}`, {
    data: { status: 'in_progress' },
  });
  expect(res.ok()).toBeTruthy();
  res = await request.patch(`/api/tasks/${taskId}`, {
    data: { status: 'completed' },
  });
  expect(res.ok()).toBeTruthy();
}

// Helper: get user by email from the users API
async function getUserByEmail(
  request: import('@playwright/test').APIRequestContext,
  email: string
) {
  const res = await request.get('/api/users');
  const users = await res.json();
  return users.find((u: { email: string }) => u.email === email);
}

test.describe('Single-verifier verification (non-delegated)', () => {
  test('admin (assigner) can verify a completed task with 4+ stars', async ({
    page,
    request,
  }) => {
    const amit = await getUserByEmail(request, 'amit@pepschoolv2.com');
    const task = await createTask(request, amit.id, 'Verify Test');
    await moveToCompleted(request, task.id);

    // Go to task detail page
    await page.goto(`/tasks/${task.id}`);
    await expect(page.getByText(task.title)).toBeVisible();

    // Should see Verify button
    const verifyBtn = page.getByRole('button', { name: 'Verify' });
    await expect(verifyBtn).toBeVisible();
    await verifyBtn.click();

    // Verify dialog should open
    await expect(page.getByText('Rate the quality')).toBeVisible();

    // Click 4th star
    const stars = page.locator('button:has(svg.lucide-star)');
    await stars.nth(3).click();

    // Click verify in dialog
    await page.getByRole('button', { name: 'Verify' }).last().click();

    // Should see success toast
    await expect(page.getByText('fully verified')).toBeVisible({ timeout: 10000 });

    // Task should now show verified banner
    await expect(page.getByText('Verified on')).toBeVisible({ timeout: 5000 });
  });

  test('verification with rating ≤3 requires a comment', async ({
    request,
  }) => {
    const amit = await getUserByEmail(request, 'amit@pepschoolv2.com');
    const task = await createTask(request, amit.id, 'Rating Comment Test');
    await moveToCompleted(request, task.id);

    // Try to verify with rating 2, no comment
    const res = await request.patch(`/api/tasks/${task.id}`, {
      data: {
        status: 'verified',
        verification_rating: 2,
      },
    });
    expect(res.ok()).toBeFalsy();
    const err = await res.json();
    expect(err.error).toContain('comment is required');
  });

  test('verification requires a rating', async ({ request }) => {
    const amit = await getUserByEmail(request, 'amit@pepschoolv2.com');
    const task = await createTask(request, amit.id, 'No Rating Test');
    await moveToCompleted(request, task.id);

    // Try to verify without rating
    const res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'verified' },
    });
    expect(res.ok()).toBeFalsy();
    const err = await res.json();
    expect(err.error).toContain('star rating');
  });

  test('rating ≤3 succeeds when comment is provided', async ({ request }) => {
    const amit = await getUserByEmail(request, 'amit@pepschoolv2.com');
    const task = await createTask(request, amit.id, 'Low Rating OK Test');
    await moveToCompleted(request, task.id);

    const res = await request.patch(`/api/tasks/${task.id}`, {
      data: {
        status: 'verified',
        verification_rating: 2,
        verification_comment: 'Needs improvement in formatting',
      },
    });
    expect(res.ok()).toBeTruthy();
    const result = await res.json();
    expect(result._fullyVerified).toBe(true);
  });
});

test.describe('Verification progress UI', () => {
  test('shows verification progress section on completed task', async ({
    page,
    request,
  }) => {
    const amit = await getUserByEmail(request, 'amit@pepschoolv2.com');
    const task = await createTask(request, amit.id, 'Progress UI Test');
    await moveToCompleted(request, task.id);

    await page.goto(`/tasks/${task.id}`);

    // Should show verification progress section
    await expect(page.getByText('Verification Progress')).toBeVisible();
    // Should show the "Assigner" slot as pending
    await expect(page.getByText('Assigner')).toBeVisible();
    await expect(page.getByText('pending')).toBeVisible();
  });
});

test.describe('Reopen clears verifications', () => {
  test('reopening a completed task allows re-verification', async ({
    request,
  }) => {
    const amit = await getUserByEmail(request, 'amit@pepschoolv2.com');
    const task = await createTask(request, amit.id, 'Reopen Test');
    await moveToCompleted(request, task.id);

    // Reopen from completed → in_progress (this clears any verifications)
    let res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'in_progress' },
    });
    expect(res.ok()).toBeTruthy();

    // Complete again (already in_progress, so go straight to completed)
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'completed' },
    });
    expect(res.ok()).toBeTruthy();

    // Verify — should work (slots are fresh)
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'verified', verification_rating: 4 },
    });
    expect(res.ok()).toBeTruthy();
    const result = await res.json();
    expect(result._fullyVerified).toBe(true);
  });
});

test.describe('Dashboard pending verification count', () => {
  test('pending count reflects tasks Priya needs to verify', async ({
    page,
    request,
  }) => {
    const amit = await getUserByEmail(request, 'amit@pepschoolv2.com');

    // Create a task that Priya assigned → she'll need to verify it
    const task = await createTask(request, amit.id, 'Pending Count Test');
    await moveToCompleted(request, task.id);

    // Visit dashboard
    await page.goto('/dashboard');
    await expect(page.getByText('Pending Verification')).toBeVisible();

    // The count should be at least 1
    // Find the stat card that contains "Pending Verification" label
    const card = page.locator('[data-slot="card"]', {
      has: page.getByText('Pending Verification'),
    });
    const countEl = card.locator('.text-2xl.font-bold');
    await expect(countEl).toHaveCount(1);
    // Wait for the count to load (it shows '--' while loading)
    await expect(countEl).not.toHaveText('--', { timeout: 10000 });
    const countText = await countEl.textContent();
    expect(Number(countText?.trim())).toBeGreaterThanOrEqual(1);

    // Clean up: verify the task so it doesn't affect other tests
    await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'verified', verification_rating: 5 },
    });
  });
});

test.describe('Verified banner and rating visibility', () => {
  test('verified task shows banner with star rating for admin', async ({
    page,
    request,
  }) => {
    const amit = await getUserByEmail(request, 'amit@pepschoolv2.com');
    const task = await createTask(request, amit.id, 'Banner Test');
    await moveToCompleted(request, task.id);

    // Verify with 4 stars
    await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'verified', verification_rating: 4 },
    });

    // Visit the task page
    await page.goto(`/tasks/${task.id}`);
    await expect(page.getByText('Verified on')).toBeVisible();

    // Admin (Priya) should see star ratings — check for filled stars
    const filledStars = page.locator('svg.lucide-star.fill-\\[\\#E8A87C\\]');
    await expect(filledStars.first()).toBeVisible();
  });
});
