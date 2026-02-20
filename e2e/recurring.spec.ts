import { test, expect } from '@playwright/test';

test.describe('Recurring tasks', () => {
  test('recurring page loads with "New Recurring Task" button', async ({ page }) => {
    await page.goto('/recurring');
    await expect(page.getByRole('heading', { name: 'Recurring Tasks' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Recurring Task' })).toBeVisible();
  });

  test('can create a new recurring task via the form', async ({ page }) => {
    await page.goto('/recurring/new');
    await expect(page.getByRole('heading', { name: 'New Recurring Task' })).toBeVisible();

    // Fill in the title
    const taskTitle = `Weekly Standup ${Date.now()}`;
    await page.fill('#title', taskTitle);

    // Recurrence type is already "Weekly" by default, Monday is already selected
    // Just submit
    await page.getByRole('button', { name: 'Create Recurring Task' }).click();

    // Should redirect to /recurring and show the task in the list
    await expect(page).toHaveURL('/recurring', { timeout: 10000 });
    await expect(page.getByText(taskTitle)).toBeVisible();
  });

  test('can pause and activate a recurring task', async ({ page, request }) => {
    // Create a recurring task via API
    const taskTitle = `Toggle Test ${Date.now()}`;
    const createRes = await request.post('/api/recurring', {
      data: {
        title: taskTitle,
        priority: 'normal',
        recurrence_rule: { type: 'weekly', interval: 1, days: [1] },
        next_run_date: '2026-03-01',
      },
    });
    expect(createRes.ok()).toBeTruthy();

    // Go to recurring page
    await page.goto('/recurring');
    await expect(page.getByText(taskTitle)).toBeVisible();

    // Find the card containing our task title
    const taskRow = page.locator('[data-slot="card"]', { hasText: taskTitle });

    // Click Pause
    await taskRow.getByRole('button', { name: 'Pause' }).click();

    // Wait for the API response and re-render — "Paused" badge should appear
    await expect(taskRow.getByText('Paused')).toBeVisible({ timeout: 5000 });
    // Button should now say "Activate"
    await expect(taskRow.getByRole('button', { name: 'Activate' })).toBeVisible();

    // Click Activate
    await taskRow.getByRole('button', { name: 'Activate' }).click();

    // Wait for re-render — button should change back to "Pause"
    await expect(taskRow.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 10000 });
  });
});
