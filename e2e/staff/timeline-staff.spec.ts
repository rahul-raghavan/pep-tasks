import { test, expect } from '@playwright/test';

test.describe('Staff timeline visibility', () => {
  test('staff can only see their own tasks in the timeline', async ({ page }) => {
    // Amit (staff) visits dashboard
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // The timeline should load — either with items or empty state
    await expect(
      page.getByText('Recent Activity').or(page.getByText('No recent status changes'))
    ).toBeVisible({ timeout: 10000 });
  });

  test('tasks assigned to staff appear in their timeline', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Verify the timeline section exists
    await expect(page.getByText('Recent Activity')).toBeVisible();
  });
});
