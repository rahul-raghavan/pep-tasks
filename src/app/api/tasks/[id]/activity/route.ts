import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

// GET /api/tasks/[id]/activity
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServiceRoleClient();

  // Check access for staff — only see activity for own tasks
  if (user.role === 'staff') {
    const { data: task } = await db
      .from('pep_tasks')
      .select('assigned_to')
      .eq('id', id)
      .single();
    if (!task || task.assigned_to !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const { data, error } = await db
    .from('pep_activity_log')
    .select('*, user:pep_users!pep_activity_log_user_id_fkey(*)')
    .eq('task_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching activity:', error);
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 });
  }

  const logs = (data || []).map((log: Record<string, unknown>) => ({
    ...log,
    user: Array.isArray(log.user) ? log.user[0] : log.user,
  }));

  return NextResponse.json(logs);
}
