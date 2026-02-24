import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCurrentUser, isAdmin, canManageTask, canAssignTo } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('pep_recurring_tasks')
    .select('*, assignee:pep_users!pep_recurring_tasks_assigned_to_fkey(*), assigner:pep_users!pep_recurring_tasks_assigned_by_fkey(*)')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Admin: block access to templates involving super_admins
  if (user.role === 'admin') {
    const assignee = (Array.isArray(data.assignee) ? data.assignee[0] : data.assignee) as { role?: string } | null;
    const assigner = (Array.isArray(data.assigner) ? data.assigner[0] : data.assigner) as { role?: string } | null;
    if (assignee?.role === 'super_admin' || assigner?.role === 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = createServiceRoleClient();

  // Fetch the template to check ownership/hierarchy
  const { data: template } = await db
    .from('pep_recurring_tasks')
    .select('assigned_by, assigned_to')
    .eq('id', id)
    .single();

  if (!template) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Admin can't modify templates created by or assigned to super-admins
  if (user.role === 'admin') {
    const roleIds = [template.assigned_by, template.assigned_to].filter(Boolean);
    if (roleIds.length > 0) {
      const { data: relatedUsers } = await db
        .from('pep_users')
        .select('id, role')
        .in('id', roleIds);
      if (relatedUsers?.some((u: { role: string }) => u.role === 'super_admin')) {
        return NextResponse.json({ error: 'Admins cannot modify super-admin recurring templates' }, { status: 403 });
      }
    }
  }

  const body = await req.json();

  // Only allow updating specific fields
  const allowed = ['title', 'description', 'assigned_to', 'priority', 'recurrence_rule', 'next_run_date', 'is_active'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }
  updates.updated_at = new Date().toISOString();

  // 5E: Validate assigned_to if being changed
  if (updates.assigned_to) {
    const { data: targetUser } = await db
      .from('pep_users')
      .select('role, is_active')
      .eq('id', updates.assigned_to as string)
      .single();

    if (!targetUser || !targetUser.is_active) {
      return NextResponse.json({ error: 'Invalid assignee' }, { status: 400 });
    }
    if (!canAssignTo(user.role, targetUser.role)) {
      return NextResponse.json({ error: 'Cannot assign to this user' }, { status: 403 });
    }
  }

  const { data, error } = await db
    .from('pep_recurring_tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = createServiceRoleClient();

  // Check hierarchy before deleting
  const { data: template } = await db
    .from('pep_recurring_tasks')
    .select('assigned_by, assigned_to')
    .eq('id', id)
    .single();

  if (!template) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (user.role === 'admin') {
    const roleIds = [template.assigned_by, template.assigned_to].filter(Boolean);
    if (roleIds.length > 0) {
      const { data: relatedUsers } = await db
        .from('pep_users')
        .select('id, role')
        .in('id', roleIds);
      if (relatedUsers?.some((u: { role: string }) => u.role === 'super_admin')) {
        return NextResponse.json({ error: 'Admins cannot delete super-admin recurring templates' }, { status: 403 });
      }
    }
  }

  const { error } = await db
    .from('pep_recurring_tasks')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
