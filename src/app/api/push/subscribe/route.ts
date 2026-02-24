import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

// POST /api/push/subscribe — save a push subscription
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { endpoint, keys } = body;

  if (!endpoint || !keys?.auth || !keys?.p256dh) {
    return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 });
  }

  const db = createServiceRoleClient();

  // Upsert on endpoint — same browser re-subscribing gets updated
  const { error } = await db
    .from('push_subscriptions')
    .upsert(
      {
        user_id: authUser.id,
        endpoint,
        auth_key: keys.auth,
        p256dh_key: keys.p256dh,
      },
      { onConflict: 'endpoint' }
    );

  if (error) {
    console.error('Error saving push subscription:', error);
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
