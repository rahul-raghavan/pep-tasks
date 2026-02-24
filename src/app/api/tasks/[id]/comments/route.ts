import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { getCenterUserIds } from '@/lib/centers';
import { notifyUsers } from '@/lib/notifications';

// Shared access check for admin: hierarchy + center visibility
async function checkAdminAccess(
  db: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  taskId: string
): Promise<{ allowed: boolean; error?: string }> {
  const { data: task } = await db
    .from('pep_tasks')
    .select('assigned_to, assigned_by')
    .eq('id', taskId)
    .single();

  if (!task) return { allowed: false, error: 'Task not found' };

  // Hierarchy check: admins can't access super-admin tasks
  const roleIds = [task.assigned_to, task.assigned_by].filter(Boolean);
  if (roleIds.length > 0) {
    const { data: relatedUsers } = await db
      .from('pep_users')
      .select('id, role')
      .in('id', roleIds);
    if (relatedUsers?.some((u: { role: string }) => u.role === 'super_admin')) {
      return { allowed: false, error: 'Forbidden' };
    }
  }

  // Center check: skip if task involves me directly
  if (task.assigned_to !== userId && task.assigned_by !== userId) {
    const centerUserIds = await getCenterUserIds(db, userId);
    if (!task.assigned_to || !centerUserIds.includes(task.assigned_to)) {
      return { allowed: false, error: 'Forbidden' };
    }
  }

  return { allowed: true };
}

// GET /api/tasks/[id]/comments
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
      .single();
    if (!task || (task.assigned_to !== user.id && task.delegated_to !== user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Admin: hierarchy + center check
  if (user.role === 'admin') {
    const access = await checkAdminAccess(db, user.id, id);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }
  }

  const { data, error } = await db
    .from('pep_comments')
    .select('*, author:pep_users!pep_comments_author_id_fkey(*)')
    .eq('task_id', id)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }

  const comments = (data || []).map((c: Record<string, unknown>) => ({
    ...c,
    author: Array.isArray(c.author) ? c.author[0] : c.author,
  }));

  return NextResponse.json(comments);
}

// POST /api/tasks/[id]/comments
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { body } = await request.json();
  if (!body?.trim()) {
    return NextResponse.json({ error: 'Comment body is required' }, { status: 400 });
  }

  const db = createServiceRoleClient();

  // Check access for staff — allow if assigned_to or delegated_to
  if (user.role === 'staff') {
    const { data: task } = await db
      .from('pep_tasks')
      .select('assigned_to, delegated_to')
      .eq('id', id)
      .single();
    if (!task || (task.assigned_to !== user.id && task.delegated_to !== user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Admin: hierarchy + center check
  if (user.role === 'admin') {
    const access = await checkAdminAccess(db, user.id, id);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }
  }

  const { data: comment, error } = await db
    .from('pep_comments')
    .insert({
      task_id: id,
      author_id: user.id,
      body: body.trim(),
    })
    .select('*, author:pep_users!pep_comments_author_id_fkey(*)')
    .single();

  if (error) {
    console.error('Error creating comment:', error);
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
  }

  const result = {
    ...comment,
    author: Array.isArray(comment.author) ? comment.author[0] : comment.author,
  };

  // Log activity
  await db.from('pep_activity_log').insert({
    task_id: id,
    user_id: user.id,
    action: 'commented',
    details: { preview: body.trim().slice(0, 100) },
  });

  // Notify all involved users (fire-and-forget)
  const { data: taskForNotify } = await db
    .from('pep_tasks')
    .select('assigned_to, assigned_by, delegated_to, title')
    .eq('id', id)
    .single();

  if (taskForNotify) {
    const involvedUsers = [
      taskForNotify.assigned_to,
      taskForNotify.assigned_by,
      taskForNotify.delegated_to,
    ].filter(Boolean) as string[];

    notifyUsers(involvedUsers, user.id, {
      title: 'New Comment',
      body: `${user.name || 'Someone'}: ${body.trim().slice(0, 80)}`,
      url: `/tasks/${id}`,
    });
  }

  return NextResponse.json(result, { status: 201 });
}
