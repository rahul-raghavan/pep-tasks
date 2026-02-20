import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/permissions';
import { getCurrentUser } from '@/lib/auth';
import { getTodayIST } from '@/lib/utils';
import { startOfWeek, endOfWeek } from 'date-fns';

// GET /api/tasks — list tasks (role-filtered)
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const priority = searchParams.get('priority');
  const assignee = searchParams.get('assignee');
  const view = searchParams.get('view');

  const db = createServiceRoleClient();
  let query = db
    .from('pep_tasks')
    .select(`
      *,
      assignee:pep_users!pep_tasks_assigned_to_fkey(*),
      assigner:pep_users!pep_tasks_assigned_by_fkey(*),
      delegate:pep_users!pep_tasks_delegated_to_fkey(*)
    `)
    .order('created_at', { ascending: false });

  // Role-based filtering: staff sees tasks assigned to them or delegated to them
  if (user.role === 'staff') {
    query = query.or(`assigned_to.eq.${user.id},delegated_to.eq.${user.id}`);
  }

  // Optional filters
  if (status) query = query.eq('status', status);
  if (priority) query = query.eq('priority', priority);
  if (assignee) query = query.eq('assigned_to', assignee);

  // Special views from dashboard cards
  if (view === 'overdue') {
    const today = getTodayIST();
    query = query.in('status', ['open', 'in_progress']).lt('due_date', today);
  } else if (view === 'due_this_week') {
    const today = getTodayIST();
    const todayDate = new Date(today + 'T00:00:00+05:30');
    const weekStart = startOfWeek(todayDate, { weekStartsOn: 1 }).toISOString().split('T')[0];
    const weekEnd = endOfWeek(todayDate, { weekStartsOn: 1 }).toISOString().split('T')[0];
    query = query.in('status', ['open', 'in_progress']).gte('due_date', weekStart).lte('due_date', weekEnd);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }

  // Flatten join results (Supabase returns arrays for joins)
  let tasks = (data || []).map((t: Record<string, unknown>) => ({
    ...t,
    assignee: Array.isArray(t.assignee) ? t.assignee[0] : t.assignee,
    assigner: Array.isArray(t.assigner) ? t.assigner[0] : t.assigner,
    delegate: Array.isArray(t.delegate) ? t.delegate[0] : t.delegate,
  }));

  // Admins can't see tasks involving super-admins
  if (user.role === 'admin') {
    tasks = tasks.filter((t: Record<string, unknown>) => {
      const assignee = t.assignee as { role?: string } | null;
      const assigner = t.assigner as { role?: string } | null;
      return assignee?.role !== 'super_admin' && assigner?.role !== 'super_admin';
    });
  }

  return NextResponse.json(tasks);
}

// POST /api/tasks — create a task (admin+ only)
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: 'Only admins can create tasks' }, { status: 403 });
  }

  const body = await request.json();
  const { title, description, assigned_to, due_date, priority } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const db = createServiceRoleClient();

  // If assigning to someone, validate the target user exists and check role permissions
  if (assigned_to) {
    const { data: targetUser } = await db
      .from('pep_users')
      .select('role, is_active')
      .eq('id', assigned_to)
      .single();

    if (!targetUser || !targetUser.is_active) {
      return NextResponse.json({ error: 'Invalid assignee' }, { status: 400 });
    }

    // Admin can only assign to admin + staff; super_admin can assign to anyone
    if (user.role === 'admin' && targetUser.role === 'super_admin') {
      return NextResponse.json({ error: 'Admins cannot assign tasks to super admins' }, { status: 403 });
    }
  }

  const { data: task, error } = await db
    .from('pep_tasks')
    .insert({
      title: title.trim(),
      description: description?.trim() || null,
      assigned_to: assigned_to || null,
      assigned_by: user.id,
      due_date: due_date || null,
      priority: priority || 'normal',
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating task:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }

  // Log activity
  await db.from('pep_activity_log').insert({
    task_id: task.id,
    user_id: user.id,
    action: 'created',
    details: { title: task.title, assigned_to, priority },
  });

  return NextResponse.json(task, { status: 201 });
}
