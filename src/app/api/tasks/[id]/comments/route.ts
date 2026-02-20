import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

// GET /api/tasks/[id]/comments
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServiceRoleClient();

  // Check access for staff
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

  // Check access for staff
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

  return NextResponse.json(result, { status: 201 });
}
