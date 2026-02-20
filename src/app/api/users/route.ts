import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isAdmin, canCreateUser } from '@/lib/permissions';
import { getCurrentUser } from '@/lib/auth';

// GET /api/users — list active users
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServiceRoleClient();
  let query = db
    .from('pep_users')
    .select('*')
    .eq('is_active', true)
    .order('name');

  // If admin (not super), only show admins and staff
  if (user.role === 'admin') {
    query = query.in('role', ['admin', 'staff']);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

// POST /api/users — create/invite a user (admin+ only)
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: 'Only admins can create users' }, { status: 403 });
  }

  const body = await request.json();
  const { email, name, role } = body;

  if (!email?.trim()) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const validRole = role || 'staff';
  if (!canCreateUser(user.role, validRole)) {
    return NextResponse.json({ error: 'You cannot create users with that role' }, { status: 403 });
  }

  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('pep_users')
    .insert({
      email: email.toLowerCase().trim(),
      name: name?.trim() || null,
      role: validRole,
    })
    .select()
    .single();

  if (error?.code === '23505') {
    return NextResponse.json({ error: 'This email is already registered' }, { status: 409 });
  }

  if (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
