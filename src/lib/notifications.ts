import webpush from 'web-push';
import { createServiceRoleClient } from '@/lib/supabase/server';

// Lazy-initialize webpush (don't call setVapidDetails at module level — breaks Vercel build)
let vapidConfigured = false;
function getWebPush() {
  if (!vapidConfigured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
    vapidConfigured = true;
  }
  return webpush;
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  app?: string;
}

/**
 * Send a push notification to a single PEP user (by pep_users.id).
 * Looks up their auth_id, then finds all push subscriptions for that auth user.
 * Best-effort: errors are logged but never thrown.
 */
export async function sendPushNotification(
  pepUserId: string,
  payload: PushPayload
): Promise<void> {
  try {
    const db = createServiceRoleClient();
    const wp = getWebPush();

    // Look up the user's auth_id from pep_users
    const { data: pepUser } = await db
      .from('pep_users')
      .select('auth_id')
      .eq('id', pepUserId)
      .single();

    if (!pepUser?.auth_id) return;

    // Find all push subscriptions for this auth user
    const { data: subs } = await db
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', pepUser.auth_id);

    if (!subs || subs.length === 0) return;

    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || '/dashboard',
      app: payload.app || 'pep-tasks',
    });

    // Send to all subscriptions in parallel
    const results = await Promise.allSettled(
      subs.map((sub) =>
        wp.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              auth: sub.auth_key,
              p256dh: sub.p256dh_key,
            },
          },
          pushPayload
        )
      )
    );

    // Clean up expired/invalid subscriptions (410 Gone or 404 Not Found)
    const expiredIds: string[] = [];
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        const statusCode = (result.reason as { statusCode?: number })?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
          expiredIds.push(subs[i].id);
        } else {
          console.error('Push notification failed:', result.reason);
        }
      }
    });

    if (expiredIds.length > 0) {
      await db.from('push_subscriptions').delete().in('id', expiredIds);
    }
  } catch (err) {
    console.error('sendPushNotification error:', err);
  }
}

/**
 * Send a push notification to multiple PEP users, excluding a specific user (the actor).
 * Best-effort: errors are logged but never thrown.
 */
export async function notifyUsers(
  pepUserIds: string[],
  excludeUserId: string,
  payload: PushPayload
): Promise<void> {
  const targets = [...new Set(pepUserIds)].filter(
    (id) => id && id !== excludeUserId
  );
  if (targets.length === 0) return;

  await Promise.allSettled(
    targets.map((id) => sendPushNotification(id, payload))
  );
}
