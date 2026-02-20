import { test, expect } from '@playwright/test';

test.describe('Cron endpoint security', () => {
  test('rejects request with no token', async ({ request }) => {
    const res = await request.get('/api/cron/generate-tasks');
    expect(res.status()).toBe(401);
  });

  test('rejects request with wrong token', async ({ request }) => {
    const res = await request.get('/api/cron/generate-tasks', {
      headers: { Authorization: 'Bearer wrong-token-here' },
    });
    expect(res.status()).toBe(401);
  });

  test('accepts request with correct CRON_SECRET', async ({ request }) => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      test.skip();
      return;
    }

    const res = await request.get('/api/cron/generate-tasks', {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('generated');
    expect(typeof body.generated).toBe('number');
  });
});
