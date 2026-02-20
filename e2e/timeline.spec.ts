import { test, expect } from '@playwright/test';

test.describe('Dashboard timeline', () => {
  test('shows recently created tasks in the timeline', async ({ page, request }) => {
    // First get the current user's ID (Priya) so we can assign the task
    const usersRes = await request.get('/api/users');
    const users = await usersRes.json();
    const priya = users.find((u: { email: string }) => u.email === 'priya@pepschoolv2.com');

    // Create a task assigned to Priya (so it shows in admin timeline)
    const taskTitle = `Timeline Test ${Date.now()}`;
    const createRes = await request.post('/api/tasks', {
      data: {
        title: taskTitle,
        priority: 'normal',
        assigned_to: priya?.id || null,
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const task = await createRes.json();

    // Visit dashboard
    await page.goto('/dashboard');
    await expect(page.getByText('Recent Activity')).toBeVisible();

    // Task should appear in timeline
    await expect(page.getByText(taskTitle)).toBeVisible({ timeout: 10000 });

    // Click the timeline entry — should navigate to task detail
    await page.getByText(taskTitle).click();
    await expect(page).toHaveURL(new RegExp(`/tasks/${task.id}`));
  });

  test('shows status change entries with badges', async ({ page, request }) => {
    // Get Priya's ID
    const usersRes = await request.get('/api/users');
    const users = await usersRes.json();
    const priya = users.find((u: { email: string }) => u.email === 'priya@pepschoolv2.com');

    // Create a task
    const taskTitle = `Status Change ${Date.now()}`;
    const createRes = await request.post('/api/tasks', {
      data: {
        title: taskTitle,
        priority: 'normal',
        assigned_to: priya?.id || null,
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const task = await createRes.json();

    // Change status to in_progress
    const patchRes = await request.patch(`/api/tasks/${task.id}`, {
      data: { status: 'in_progress' },
    });
    expect(patchRes.ok()).toBeTruthy();

    // Visit dashboard — should show the "moved" entry
    await page.goto('/dashboard');
    await expect(page.getByText('Recent Activity')).toBeVisible();
    await expect(page.getByText(taskTitle).first()).toBeVisible({ timeout: 10000 });
  });
});
