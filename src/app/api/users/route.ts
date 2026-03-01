import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isAdmin, canCreateUser, canManageUser } from '@/lib/permissions';
import { getCurrentUser } from '@/lib/auth';

// GET /api/users — list active users (admin+ get full list, staff get minimal list for assignment dropdowns)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServiceRoleClient();

  // Staff: return only basic user info (id, name, email) without centers
  // This is needed for assignment dropdowns but shouldn't leak org details
  if (user.role === 'staff') {
    const { data, error } = await db
      .from('pep_users')
      .select('id, name, email, role')
      .eq('is_active', true)
      .order('name');

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }
    return NextResponse.json(data || []);
  }

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

  // Fetch center assignments for all users
  const userIds = (data || []).map((u: { id: string }) => u.id);
  let centerMap: Record<string, { id: string; name: string; is_active: boolean }[]> = {};

  if (userIds.length > 0) {
    const { data: userCenters } = await db
      .from('pep_user_centers')
      .select('user_id, center_id, pep_centers(id, name, is_active)')
      .in('user_id', userIds);

    if (userCenters) {
      for (const uc of userCenters) {
        const center = Array.isArray(uc.pep_centers) ? uc.pep_centers[0] : uc.pep_centers;
        if (!center) continue;
        if (!centerMap[uc.user_id]) centerMap[uc.user_id] = [];
        centerMap[uc.user_id].push(center);
      }
    }
  }

  const usersWithCenters = (data || []).map((u: { id: string }) => ({
    ...u,
    centers: centerMap[u.id] || [],
  }));

  return NextResponse.json(usersWithCenters);
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
    // Check if this is an inactive user that can be re-activated
    const { data: existing } = await db
      .from('pep_users')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (existing && !existing.is_active) {
      // Hierarchy check: admin can't reactivate a super_admin
      if (!canManageUser(user.role, existing.role)) {
        return NextResponse.json({ error: 'You cannot reactivate users of this role' }, { status: 403 });
      }
      // Also check the requested new role is allowed
      if (!canCreateUser(user.role, validRole)) {
        return NextResponse.json({ error: 'You cannot assign that role' }, { status: 403 });
      }

      // Re-activate the user with updated name/role
      const { data: reactivated, error: updateErr } = await db
        .from('pep_users')
        .update({
          is_active: true,
          name: name?.trim() || existing.name,
          role: validRole,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateErr) {
        return NextResponse.json({ error: 'Failed to re-activate user' }, { status: 500 });
      }
      return NextResponse.json(reactivated, { status: 200 });
    }

    return NextResponse.json({ error: 'This email is already registered' }, { status: 409 });
  }

  if (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
