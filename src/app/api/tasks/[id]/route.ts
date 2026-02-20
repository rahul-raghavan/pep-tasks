import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isAdmin, canVerifyTasks } from '@/lib/permissions';
import { getCurrentUser } from '@/lib/auth';

// GET /api/tasks/[id] — get single task with joins
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServiceRoleClient();
  const { data: task, error } = await db
    .from('pep_tasks')
    .select(`
      *,
      assignee:pep_users!pep_tasks_assigned_to_fkey(*),
      assigner:pep_users!pep_tasks_assigned_by_fkey(*)
    `)
    .eq('id', id)
    .single();

  if (error || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Staff can only see their own tasks
  if (user.role === 'staff' && task.assigned_to !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Flatten joins
  const result = {
    ...task,
    assignee: Array.isArray(task.assignee) ? task.assignee[0] : task.assignee,
    assigner: Array.isArray(task.assigner) ? task.assigner[0] : task.assigner,
  };

  return NextResponse.json(result);
}

// PATCH /api/tasks/[id] — update a task
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServiceRoleClient();

  // Get current task state
  const { data: currentTask } = await db
    .from('pep_tasks')
    .select('*')
    .eq('id', id)
    .single();

  if (!currentTask) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Staff can only update their own tasks (and only status)
  if (user.role === 'staff' && currentTask.assigned_to !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  const activityDetails: Record<string, unknown> = {};

  // Handle status change
  if (body.status && body.status !== currentTask.status) {
    const validTransitions: Record<string, string[]> = {
      open: ['in_progress'],
      in_progress: ['completed', 'open'],
      completed: ['verified', 'in_progress'],
      verified: [],
    };

    if (!validTransitions[currentTask.status]?.includes(body.status)) {
      return NextResponse.json(
        { error: `Cannot transition from ${currentTask.status} to ${body.status}` },
        { status: 400 }
      );
    }

    // Only admin+ can verify
    if (body.status === 'verified' && !canVerifyTasks(user.role)) {
      return NextResponse.json({ error: 'Only admins can verify tasks' }, { status: 403 });
    }

    // Staff can only move their own tasks to in_progress or completed
    if (user.role === 'staff') {
      if (!['in_progress', 'completed'].includes(body.status)) {
        return NextResponse.json({ error: 'Staff can only mark tasks in progress or complete' }, { status: 403 });
      }
    }

    updates.status = body.status;
    activityDetails.from = currentTask.status;
    activityDetails.to = body.status;

    if (body.status === 'completed') {
      updates.completed_at = new Date().toISOString();
    }
    if (body.status === 'verified') {
      updates.verified_by = user.id;
      updates.verified_at = new Date().toISOString();
    }
    // If reopening from completed, clear completed_at
    if (body.status === 'in_progress' && currentTask.status === 'completed') {
      updates.completed_at = null;
    }
  }

  // Handle other field updates (admin+ only)
  if (isAdmin(user.role)) {
    if (body.title !== undefined && body.title !== currentTask.title) {
      updates.title = body.title.trim();
      activityDetails.title_changed = { from: currentTask.title, to: body.title.trim() };
    }
    if (body.description !== undefined && body.description !== currentTask.description) {
      updates.description = body.description?.trim() || null;
    }
    if (body.assigned_to !== undefined && body.assigned_to !== currentTask.assigned_to) {
      updates.assigned_to = body.assigned_to || null;
      activityDetails.reassigned = { from: currentTask.assigned_to, to: body.assigned_to };
    }
    if (body.due_date !== undefined && body.due_date !== currentTask.due_date) {
      updates.due_date = body.due_date || null;
      activityDetails.due_date_changed = { from: currentTask.due_date, to: body.due_date };
    }
    if (body.priority !== undefined && body.priority !== currentTask.priority) {
      updates.priority = body.priority;
      activityDetails.priority_changed = { from: currentTask.priority, to: body.priority };
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No changes to apply' }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const { data: updatedTask, error } = await db
    .from('pep_tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating task:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }

  // Log activity
  const action = body.status && body.status !== currentTask.status
    ? 'status_changed'
    : 'updated';

  await db.from('pep_activity_log').insert({
    task_id: id,
    user_id: user.id,
    action,
    details: activityDetails,
  });

  return NextResponse.json(updatedTask);
}
