import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isAdmin, canVerifyTasks, canManageTask, canAssignTo, canDelegate, canDelegateTo } from '@/lib/permissions';
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
      assigner:pep_users!pep_tasks_assigned_by_fkey(*),
      delegate:pep_users!pep_tasks_delegated_to_fkey(*)
    `)
    .eq('id', id)
    .single();

  if (error || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Staff can only see tasks assigned to them or delegated to them
  if (user.role === 'staff' && task.assigned_to !== user.id && task.delegated_to !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Admins can't see tasks assigned to/by super-admins (unless they ARE super-admin)
  if (user.role === 'admin') {
    const assigneeRole = Array.isArray(task.assignee) ? task.assignee[0]?.role : task.assignee?.role;
    const assignerRole = Array.isArray(task.assigner) ? task.assigner[0]?.role : task.assigner?.role;
    if (assigneeRole === 'super_admin' || assignerRole === 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Flatten joins
  const result = {
    ...task,
    assignee: Array.isArray(task.assignee) ? task.assignee[0] : task.assignee,
    assigner: Array.isArray(task.assigner) ? task.assigner[0] : task.assigner,
    delegate: Array.isArray(task.delegate) ? task.delegate[0] : task.delegate,
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

  // Staff can only update tasks assigned to them or delegated to them (and only status)
  if (user.role === 'staff' && currentTask.assigned_to !== user.id && currentTask.delegated_to !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Admins can't update tasks assigned to/by super-admins
  if (user.role === 'admin') {
    // Look up assignee and assigner roles
    const roleIds = [currentTask.assigned_to, currentTask.assigned_by].filter(Boolean);
    if (roleIds.length > 0) {
      const { data: relatedUsers } = await db
        .from('pep_users')
        .select('id, role')
        .in('id', roleIds);
      const hasSuperAdmin = relatedUsers?.some((u: { role: string }) => u.role === 'super_admin');
      if (hasSuperAdmin) {
        return NextResponse.json({ error: 'Admins cannot modify super-admin tasks' }, { status: 403 });
      }
    }
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
      if (body.assigned_to) {
        // Validate the new assignee exists, is active, and respects role hierarchy
        const { data: newAssignee } = await db
          .from('pep_users')
          .select('role, is_active')
          .eq('id', body.assigned_to)
          .single();

        if (!newAssignee || !newAssignee.is_active) {
          return NextResponse.json({ error: 'Invalid assignee' }, { status: 400 });
        }
        if (!canAssignTo(user.role, newAssignee.role)) {
          return NextResponse.json({ error: 'You cannot assign tasks to users of that role' }, { status: 403 });
        }
      }
      updates.assigned_to = body.assigned_to || null;
      activityDetails.reassigned = { from: currentTask.assigned_to, to: body.assigned_to };
      // Auto-clear delegation when reassigning
      if (currentTask.delegated_to) {
        updates.delegated_to = null;
        activityDetails.delegation_cleared = true;
      }
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

  // Handle delegation (admin+ only, not part of general field updates)
  if (body.delegated_to !== undefined) {
    if (body.delegated_to === null) {
      // Removing delegation
      if (!canDelegate(user.role, user.id, currentTask.assigned_to)) {
        return NextResponse.json({ error: 'You cannot modify delegation on this task' }, { status: 403 });
      }
      if (currentTask.delegated_to) {
        updates.delegated_to = null;
        // Log undelegation separately
        await db.from('pep_activity_log').insert({
          task_id: id,
          user_id: user.id,
          action: 'undelegated',
          details: { from: currentTask.delegated_to },
        });
      }
    } else if (body.delegated_to !== currentTask.delegated_to) {
      // Setting or changing delegation
      if (!canDelegate(user.role, user.id, currentTask.assigned_to)) {
        return NextResponse.json({ error: 'You cannot delegate this task' }, { status: 403 });
      }
      // Validate the delegate exists, is active, and is staff
      const { data: delegateUser } = await db
        .from('pep_users')
        .select('id, name, role, is_active')
        .eq('id', body.delegated_to)
        .single();

      if (!delegateUser || !delegateUser.is_active) {
        return NextResponse.json({ error: 'Invalid delegate' }, { status: 400 });
      }
      if (!canDelegateTo(delegateUser.role)) {
        return NextResponse.json({ error: 'You can only delegate to staff members' }, { status: 403 });
      }

      updates.delegated_to = body.delegated_to;
      await db.from('pep_activity_log').insert({
        task_id: id,
        user_id: user.id,
        action: 'delegated',
        details: {
          to: body.delegated_to,
          to_name: delegateUser.name,
          ...(currentTask.delegated_to ? { from: currentTask.delegated_to } : {}),
        },
      });
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
