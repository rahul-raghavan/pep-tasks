import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ALLOWED_DOMAINS } from '@/lib/auth';

function sanitizeRedirectPath(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
    return '/dashboard';
  }
  return path;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = sanitizeRedirectPath(searchParams.get('next') ?? '/dashboard');

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Handle error
            }
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Auth code exchange error:', error.message);
      return NextResponse.redirect(
        `${origin}/login?error=auth_error&detail=${encodeURIComponent(error.message)}`
      );
    }

    if (data.user?.email) {
      const email = data.user.email.toLowerCase();
      const domain = email.split('@')[1];

      // Check domain whitelist
      if (!ALLOWED_DOMAINS.includes(domain)) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=unauthorized_domain`);
      }

      // Check if user exists in pep_users table
      const db = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: existingUser } = await db
        .from('pep_users')
        .select('id, is_active, auth_id')
        .eq('email', email)
        .single();

      if (!existingUser) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=not_registered`);
      }

      if (!existingUser.is_active) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=deactivated`);
      }

      // Link auth_id on first login
      if (!existingUser.auth_id) {
        await db
          .from('pep_users')
          .update({ auth_id: data.user.id })
          .eq('id', existingUser.id);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_error`);
}
