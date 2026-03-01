import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  // Hard-block in production
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { email, name, role } = await request.json();
  if (!email) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }

  const serviceDb = createServiceRoleClient();

  // 1. Ensure Supabase auth user exists
  const { data: createdUser, error: createError } =
    await serviceDb.auth.admin.createUser({
      email,
      email_confirm: true,
    });

  let authUserId: string;

  if (createError) {
    if (createError.message?.includes('already been registered')) {
      const { data: listData } = await serviceDb.auth.admin.listUsers();
      const existing = listData?.users?.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      );
      if (!existing) {
        return NextResponse.json(
          { error: 'Could not find existing auth user' },
          { status: 500 }
        );
      }
      authUserId = existing.id;
    } else {
      return NextResponse.json(
        { error: createError.message },
        { status: 500 }
      );
    }
  } else {
    authUserId = createdUser.user.id;
  }

  // 2. Generate a magic link
  const { data: linkData, error: linkError } =
    await serviceDb.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

  if (linkError || !linkData) {
    return NextResponse.json(
      { error: linkError?.message || 'Failed to generate link' },
      { status: 500 }
    );
  }

  // 3. Verify OTP to get session
  const plainClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: verifyData, error: verifyError } =
    await plainClient.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    });

  if (verifyError || !verifyData.session) {
    return NextResponse.json(
      { error: verifyError?.message || 'Failed to verify OTP' },
      { status: 500 }
    );
  }

  // 4. Ensure pep_users record exists, is active, and has correct auth_id
  const { data: pepUser } = await serviceDb
    .from('pep_users')
    .select('id, auth_id, is_active')
    .eq('email', email.toLowerCase())
    .single();

  if (!pepUser) {
    // Create the pep_users record (dev-only convenience)
    await serviceDb.from('pep_users').insert({
      email: email.toLowerCase(),
      name: name || email.split('@')[0],
      role: role || 'staff',
      auth_id: authUserId,
      is_active: true,
    });
  } else {
    // Always ensure auth_id is linked and user is active
    const updates: Record<string, unknown> = {};
    if (pepUser.auth_id !== authUserId) updates.auth_id = authUserId;
    if (!pepUser.is_active) updates.is_active = true;
    if (Object.keys(updates).length > 0) {
      await serviceDb
        .from('pep_users')
        .update(updates)
        .eq('id', pepUser.id);
    }
  }

  // 5. Set session cookies in the Supabase SSR format
  const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
  const cookieBaseName = `sb-${projectRef}-auth-token`;

  const sessionPayload = JSON.stringify(verifyData.session);

  // @supabase/ssr chunks cookies at ~3180 chars
  const CHUNK_SIZE = 3180;
  const response = NextResponse.json({ ok: true });

  if (sessionPayload.length <= CHUNK_SIZE) {
    response.cookies.set(cookieBaseName, sessionPayload, {
      path: '/',
      maxAge: 60 * 60, // 1 hour
      httpOnly: false,
      secure: false,
      sameSite: 'lax',
    });
  } else {
    // Chunk the session
    for (let i = 0; i < sessionPayload.length; i += CHUNK_SIZE) {
      const chunkIdx = Math.floor(i / CHUNK_SIZE);
      response.cookies.set(
        `${cookieBaseName}.${chunkIdx}`,
        sessionPayload.slice(i, i + CHUNK_SIZE),
        {
          path: '/',
          maxAge: 60 * 60,
          httpOnly: false,
          secure: false,
          sameSite: 'lax',
        }
      );
    }
  }

  return response;
}
