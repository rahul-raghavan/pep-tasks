import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { getCenterUserIds } from '@/lib/centers';

// GET /api/tasks/[id]/activity
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServiceRoleClient();

  // Check access for staff — allow if assigned_to or delegated_to
  if (user.role === 'staff') {
    const { data: task } = await db
      .from('pep_tasks')
      .select('assigned_to, delegated_to')
      .eq('id', id)
      .eq('is_archived', false)
      .single();
    if (!task || (task.assigned_to !== user.id && task.delegated_to !== user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Admin: hierarchy + center check
  if (user.role === 'admin') {
    const { data: task } = await db
      .from('pep_tasks')
      .select('assigned_to, assigned_by')
      .eq('id', id)
      .eq('is_archived', false)
      .single();

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Hierarchy check: admins can't access super-admin tasks
    const roleIds = [task.assigned_to, task.assigned_by].filter(Boolean);
    if (roleIds.length > 0) {
      const { data: relatedUsers } = await db
        .from('pep_users')
        .select('id, role')
        .in('id', roleIds);
      if (relatedUsers?.some((u: { role: string }) => u.role === 'super_admin')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Center check: skip if task involves me directly
    if (task.assigned_to !== user.id && task.assigned_by !== user.id) {
      const centerUserIds = await getCenterUserIds(db, user.id);
      if (!task.assigned_to || !centerUserIds.includes(task.assigned_to)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const { data, error, count } = await db
    .from('pep_activity_log')
    .select('id, task_id, user_id, action, details, created_at, user:pep_users!pep_activity_log_user_id_fkey(id, name, email)', { count: 'exact' })
    .eq('task_id', id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching activity:', error);
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 });
  }

  const logs = (data || []).map((log: Record<string, unknown>) => ({
    ...log,
    user: Array.isArray(log.user) ? log.user[0] : log.user,
  }));

  return NextResponse.json({ logs, total: count ?? logs.length });
}
