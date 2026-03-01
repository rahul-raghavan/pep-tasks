import { test, expect } from '@playwright/test';

// Helper: get user by email
async function getUserByEmail(
  request: import('@playwright/test').APIRequestContext,
  email: string
) {
  const res = await request.get('/api/users');
  const users = await res.json();
  return users.find((u: { email: string }) => u.email === email);
}

test.describe('Super admin verification override', () => {
  test('super_admin can verify any task (not their own assignment)', async ({
    request,
  }) => {
    // Test Rahul (super_admin) verifying a task that Priya assigned to Amit
    const priya = await getUserByEmail(request, 'priya@pepschoolv2.com');
    const amit = await getUserByEmail(request, 'amit@pepschoolv2.com');

    // Super_admin creates task assigned to Priya, who is assigned_by = Test Rahul
    const title = `SA Override ${Date.now()}`;
    let res = await request.post('/api/tasks', {
      data: { title, priority: 'normal', assigned_to: amit.id },
    });
    expect(res.ok()).toBeTruthy();
    const task = await res.json();

    // Move to completed
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'in_progress' },
    });
    expect(res.ok()).toBeTruthy();
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'completed' },
    });
    expect(res.ok()).toBeTruthy();

    // Super_admin verifies (fills assigned_by slot since they are the assigner)
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'verified', verification_rating: 5 },
    });
    expect(res.ok()).toBeTruthy();
    const result = await res.json();
    expect(result._fullyVerified).toBe(true);
  });
});

test.describe('Two-verifier delegation flow', () => {
  test('delegated task requires both assigner and delegator to verify', async ({
    request,
  }) => {
    const priya = await getUserByEmail(request, 'priya@pepschoolv2.com');
    const amit = await getUserByEmail(request, 'amit@pepschoolv2.com');

    // Test Rahul (super_admin) creates task assigned to Priya (admin)
    const title = `Two Verifier ${Date.now()}`;
    let res = await request.post('/api/tasks', {
      data: { title, priority: 'normal', assigned_to: priya.id },
    });
    expect(res.ok()).toBeTruthy();
    const task = await res.json();

    // Delegate to Amit (staff)
    // Now: assigned_by = Test Rahul (super_admin), assigned_to = Priya (admin), delegated_to = Amit (staff)
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { delegated_to: amit.id },
    });
    expect(res.ok()).toBeTruthy();

    // Move to completed
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'in_progress' },
    });
    expect(res.ok()).toBeTruthy();
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'completed' },
    });
    expect(res.ok()).toBeTruthy();

    // Super_admin (Test Rahul = assigned_by) verifies — should be PARTIAL
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'verified', verification_rating: 4 },
    });
    expect(res.ok()).toBeTruthy();
    let result = await res.json();
    expect(result._fullyVerified).toBe(false);

    // Task should still be 'completed' (not 'verified')
    res = await request.get(`/api/tasks/${task.id}`);
    let taskData = await res.json();
    expect(taskData.status).toBe('completed');
    expect(taskData.verifications.length).toBe(1);
    expect(taskData.verifications[0].verifier_role).toBe('assigned_by');

    // Super_admin tries to verify again — should fail (already filled their slot)
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'verified', verification_rating: 5 },
    });
    // The assigned_by slot is filled. Super_admin should fill the next available slot (assigned_to).
    // Actually, super_admin fills any unfilled slot, so this should fill assigned_to slot.
    expect(res.ok()).toBeTruthy();
    result = await res.json();
    expect(result._fullyVerified).toBe(true);

    // Task should now be 'verified'
    res = await request.get(`/api/tasks/${task.id}`);
    taskData = await res.json();
    expect(taskData.status).toBe('verified');
    expect(taskData.verifications.length).toBe(2);
  });

  test('partially verified task stays completed with verification progress', async ({
    page,
    request,
  }) => {
    const priya = await getUserByEmail(request, 'priya@pepschoolv2.com');
    const amit = await getUserByEmail(request, 'amit@pepschoolv2.com');

    // Create delegated task: assigned_by=Rahul, assigned_to=Priya, delegated_to=Amit
    const title = `Partial Verify UI ${Date.now()}`;
    let res = await request.post('/api/tasks', {
      data: { title, priority: 'normal', assigned_to: priya.id },
    });
    expect(res.ok()).toBeTruthy();
    const task = await res.json();

    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { delegated_to: amit.id },
    });
    expect(res.ok()).toBeTruthy();

    // Move to completed
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'in_progress' },
    });
    expect(res.ok()).toBeTruthy();
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'completed' },
    });
    expect(res.ok()).toBeTruthy();

    // Verify as super_admin (fills assigned_by slot — partial)
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'verified', verification_rating: 5 },
    });
    expect(res.ok()).toBeTruthy();

    // Visit the task detail page
    await page.goto(`/tasks/${task.id}`);
    await expect(page.getByText(title)).toBeVisible();

    // Should show verification progress (task is still completed)
    await expect(page.getByText('Verification Progress')).toBeVisible();

    // Should show Assigner slot as filled (green dot)
    await expect(page.getByText('Assigner')).toBeVisible();
    // Should show Delegator slot as pending
    await expect(page.getByText('Delegator')).toBeVisible();
    await expect(page.getByText('pending')).toBeVisible();

    // Clean up: fill the second slot so task is fully verified
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'verified', verification_rating: 4 },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('reopening a partially verified delegated task clears verifications', async ({
    request,
  }) => {
    const priya = await getUserByEmail(request, 'priya@pepschoolv2.com');
    const amit = await getUserByEmail(request, 'amit@pepschoolv2.com');

    // Create delegated task
    const title = `Reopen Delegated ${Date.now()}`;
    let res = await request.post('/api/tasks', {
      data: { title, priority: 'normal', assigned_to: priya.id },
    });
    expect(res.ok()).toBeTruthy();
    const task = await res.json();

    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { delegated_to: amit.id },
    });
    expect(res.ok()).toBeTruthy();

    // Move to completed
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'in_progress' },
    });
    expect(res.ok()).toBeTruthy();
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'completed' },
    });
    expect(res.ok()).toBeTruthy();

    // Partially verify (1 of 2 slots)
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'verified', verification_rating: 4 },
    });
    expect(res.ok()).toBeTruthy();

    // Confirm partial: 1 verification exists
    res = await request.get(`/api/tasks/${task.id}`);
    let taskData = await res.json();
    expect(taskData.verifications.length).toBe(1);
    expect(taskData.status).toBe('completed');

    // Reopen the task
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'in_progress' },
    });
    expect(res.ok()).toBeTruthy();

    // Verifications should be cleared
    res = await request.get(`/api/tasks/${task.id}`);
    taskData = await res.json();
    expect(taskData.verifications.length).toBe(0);

    // Can complete and verify fresh
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'completed' },
    });
    expect(res.ok()).toBeTruthy();

    // First verification (should be partial again)
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'verified', verification_rating: 5 },
    });
    expect(res.ok()).toBeTruthy();
    const result = await res.json();
    expect(result._fullyVerified).toBe(false);
  });
});

test.describe('Verified timeline', () => {
  test('verified action appears in dashboard timeline', async ({
    page,
    request,
  }) => {
    const amit = await getUserByEmail(request, 'amit@pepschoolv2.com');

    const title = `Timeline Verified ${Date.now()}`;
    let res = await request.post('/api/tasks', {
      data: { title, priority: 'normal', assigned_to: amit.id },
    });
    expect(res.ok()).toBeTruthy();
    const task = await res.json();

    // Move to completed and verify
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'in_progress' },
    });
    expect(res.ok()).toBeTruthy();
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'completed' },
    });
    expect(res.ok()).toBeTruthy();
    res = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'verified', verification_rating: 5 },
    });
    expect(res.ok()).toBeTruthy();

    // Check dashboard timeline
    await page.goto('/dashboard');
    await expect(page.getByText('Recent Activity')).toBeVisible();

    // Should show "verified" entry
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 10000 });
  });
});
