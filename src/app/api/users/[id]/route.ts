import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isAdmin, canCreateUser } from '@/lib/permissions';
import { getCurrentUser } from '@/lib/auth';
import { UserRole } from '@/types/database';

// PATCH /api/users/[id] — update user role or active status
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = createServiceRoleClient();

  // Get target user
  const { data: targetUser } = await db
    .from('pep_users')
    .select('*')
    .eq('id', id)
    .single();

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Prevent self-modification
  if (targetUser.id === user.id) {
    return NextResponse.json({ error: "You can't modify your own account" }, { status: 400 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  // Role change
  if (body.role !== undefined && body.role !== targetUser.role) {
    const newRole = body.role as UserRole;
    if (!canCreateUser(user.role, newRole)) {
      return NextResponse.json({ error: 'You cannot assign that role' }, { status: 403 });
    }
    // Admin can't modify super_admins
    if (user.role === 'admin' && targetUser.role === 'super_admin') {
      return NextResponse.json({ error: 'Cannot modify super admins' }, { status: 403 });
    }
    updates.role = newRole;
  }

  // Active toggle
  if (body.is_active !== undefined) {
    updates.is_active = body.is_active;
  }

  // Name update
  if (body.name !== undefined) {
    updates.name = body.name?.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No changes' }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from('pep_users')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }

  return NextResponse.json(data);
}
