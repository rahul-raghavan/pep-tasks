import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isAdmin, canCreateUser, canManageUser } from '@/lib/permissions';
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

  // Hierarchy check: admins can't modify super_admins at all
  if (!canManageUser(user.role, targetUser.role)) {
    return NextResponse.json({ error: 'You cannot modify users of this role' }, { status: 403 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  // Role change
  if (body.role !== undefined && body.role !== targetUser.role) {
    const newRole = body.role as UserRole;
    if (!canCreateUser(user.role, newRole)) {
      return NextResponse.json({ error: 'You cannot assign that role' }, { status: 403 });
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

  // Center assignment (super_admin only)
  if (body.center_ids !== undefined) {
    if (user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can assign centers' }, { status: 403 });
    }

    const centerIds = body.center_ids as string[];

    // Insert new assignments first, then delete old ones — prevents data loss on insert failure
    if (centerIds.length > 0) {
      // Use upsert to avoid conflicts with any centers that are staying
      const rows = centerIds.map((centerId: string) => ({
        user_id: id,
        center_id: centerId,
      }));
      const { error: centerError } = await db
        .from('pep_user_centers')
        .upsert(rows, { onConflict: 'user_id,center_id' });
      if (centerError) {
        console.error('Error assigning centers:', centerError);
        return NextResponse.json({ error: 'Failed to assign centers' }, { status: 500 });
      }
    }

    // Now remove centers that are no longer in the list
    // (or all centers if centerIds is empty)
    let deleteQuery = db.from('pep_user_centers').delete().eq('user_id', id);
    if (centerIds.length > 0) {
      deleteQuery = deleteQuery.not('center_id', 'in', `(${centerIds.join(',')})`);
    }
    await deleteQuery;
  }

  if (Object.keys(updates).length === 0 && body.center_ids === undefined) {
    return NextResponse.json({ error: 'No changes' }, { status: 400 });
  }

  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();

    const { error } = await db
      .from('pep_users')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating user:', error);
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }
  }

  // Return the updated user with centers
  const { data: updatedUser } = await db
    .from('pep_users')
    .select('*')
    .eq('id', id)
    .single();

  // Fetch centers
  const { data: userCenters } = await db
    .from('pep_user_centers')
    .select('center_id, pep_centers(id, name, is_active)')
    .eq('user_id', id);

  const centers = (userCenters || []).map((uc: { pep_centers: unknown }) => {
    return Array.isArray(uc.pep_centers) ? uc.pep_centers[0] : uc.pep_centers;
  }).filter(Boolean);

  return NextResponse.json({ ...updatedUser, centers });
}
