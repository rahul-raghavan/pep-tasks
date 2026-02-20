import { test, expect } from '@playwright/test';

test.describe('Self-assign feature', () => {
  test('clicking "Assign to me" sets the current user in the dropdown', async ({ page }) => {
    await page.goto('/tasks/new');
    await expect(page.getByRole('heading', { name: 'New Task' })).toBeVisible();

    // Wait for the user list to load from /api/users
    // The Select will have items once users are fetched
    await page.waitForResponse((res) => res.url().includes('/api/users') && res.ok());

    // Click "Assign to me"
    await page.getByRole('button', { name: 'Assign to me' }).click();

    // The combobox (Select trigger) should now show Priya's name
    // Find the first combobox in the "Assign to" section
    const assignSection = page.locator('div', { has: page.getByText('Assign to', { exact: true }) });
    const selectTrigger = assignSection.locator('button[data-slot="select-trigger"]').first();
    await expect(selectTrigger).toContainText('Priya', { timeout: 5000 });
  });
});
