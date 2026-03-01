import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isAdmin, canVerifyTasks, canAssignTo, canDelegate, canDelegateTo, canCreatorDelete, isWithinEditWindow, getVerificationRequirements, isFullyVerified } from '@/lib/permissions';
import { getCurrentUser } from '@/lib/auth';
import { getCenterUserIds } from '@/lib/centers';
import { sendPushNotification } from '@/lib/notifications';
import { formatDisplayName } from '@/lib/format-name';

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
      id, title, description, status, priority, assigned_to, assigned_by, delegated_to, due_date, completed_at, verified_by, verified_at, verification_rating, created_at, updated_at,
      assignee:pep_users!pep_tasks_assigned_to_fkey(id, name, email, role),
      assigner:pep_users!pep_tasks_assigned_by_fkey(id, name, email, role),
      delegate:pep_users!pep_tasks_delegated_to_fkey(id, name, email)
    `)
    .eq('id', id)
    .eq('is_archived', false)
    .single();

  if (error || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Cast to work with Supabase's inferred types from explicit column selects
  const t = task as Record<string, unknown>;

  // Staff can only see tasks assigned to them or delegated to them
  if (user.role === 'staff' && t.assigned_to !== user.id && t.delegated_to !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Admins can't see tasks assigned to/by super-admins (unless they ARE super-admin)
  if (user.role === 'admin') {
    const rawAssignee = t.assignee;
    const rawAssigner = t.assigner;
    const assigneeRole = Array.isArray(rawAssignee) ? (rawAssignee[0] as Record<string, unknown>)?.role : (rawAssignee as Record<string, unknown> | null)?.role;
    const assignerRole = Array.isArray(rawAssigner) ? (rawAssigner[0] as Record<string, unknown>)?.role : (rawAssigner as Record<string, unknown> | null)?.role;
    if (assigneeRole === 'super_admin' || assignerRole === 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Center visibility check: skip if task involves me directly
    if (t.assigned_to !== user.id && t.assigned_by !== user.id) {
      const centerUserIds = await getCenterUserIds(db, user.id);
      if (!t.assigned_to || !centerUserIds.includes(t.assigned_to as string)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  // Fetch verifications for this task
  const { data: verifications } = await db
    .from('pep_verifications')
    .select('id, task_id, verifier_id, verifier_role, rating, comment_id, created_at')
    .eq('task_id', id);

  // Resolve verifier names
  let enrichedVerifications: Array<Record<string, unknown>> = [];
  if (verifications && verifications.length > 0) {
    const verifierIds = [...new Set(verifications.map((v: { verifier_id: string }) => v.verifier_id))];
    const { data: verifierUsers } = await db
      .from('pep_users')
      .select('id, name, email')
      .in('id', verifierIds);
    const verifierMap = new Map(
      (verifierUsers || []).map((u: { id: string; name: string | null; email: string }) => [
        u.id,
        formatDisplayName(u.name, u.email),
      ])
    );
    enrichedVerifications = verifications.map((v: Record<string, unknown>) => ({
      ...v,
      verifier_name: verifierMap.get(v.verifier_id as string) || 'Unknown',
    }));
  }

  // Determine if viewer is the worker (should not see ratings)
  const isWorker =
    (t.delegated_to && t.delegated_to === user.id) ||
    (!t.delegated_to && t.assigned_to === user.id);

  // Strip ratings from verifications if viewer is the worker
  if (isWorker) {
    enrichedVerifications = enrichedVerifications.map((v) => ({
      ...v,
      rating: null,
    }));
  }

  // Flatten joins
  const result = {
    ...t,
    assignee: Array.isArray(t.assignee) ? (t.assignee as Record<string, unknown>[])[0] : t.assignee,
    assigner: Array.isArray(t.assigner) ? (t.assigner as Record<string, unknown>[])[0] : t.assigner,
    delegate: Array.isArray(t.delegate) ? (t.delegate as Record<string, unknown>[])[0] : t.delegate,
    verifications: enrichedVerifications,
    // Strip overall rating from worker
    verification_rating: isWorker ? null : t.verification_rating,
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
    .eq('is_archived', false)
    .single();

  if (!currentTask) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Verified tasks cannot be modified
  if (currentTask.status === 'verified') {
    return NextResponse.json({ error: 'Verified tasks cannot be modified' }, { status: 400 });
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

    // Center visibility check: skip if task involves me directly
    if (currentTask.assigned_to !== user.id && currentTask.assigned_by !== user.id) {
      const centerUserIds = await getCenterUserIds(db, user.id);
      if (!currentTask.assigned_to || !centerUserIds.includes(currentTask.assigned_to)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

    if (body.status === 'completed') {
      updates.status = body.status;
      updates.completed_at = new Date().toISOString();
      activityDetails.from = currentTask.status;
      activityDetails.to = body.status;
    } else if (body.status === 'verified') {
      // --- Multi-verification flow ---
      const rating = body.verification_rating;
      if (rating == null || !Number.isInteger(rating) || rating < 1 || rating > 5) {
        return NextResponse.json(
          { error: 'A star rating (1-5) is required to verify a task' },
          { status: 400 }
        );
      }
      if (rating <= 3 && !body.verification_comment?.trim()) {
        return NextResponse.json(
          { error: 'A comment is required for ratings of 3 stars or below' },
          { status: 400 }
        );
      }

      // Fetch existing verifications
      const { data: existingVerifications } = await db
        .from('pep_verifications')
        .select('verifier_role')
        .eq('task_id', id);

      const requirements = getVerificationRequirements(
        user.role,
        user.id,
        currentTask.assigned_by,
        currentTask.assigned_to,
        currentTask.delegated_to,
        existingVerifications || []
      );

      if (!requirements.canVerify || !requirements.availableSlot) {
        return NextResponse.json(
          { error: 'You are not authorized to verify this task, or you have already verified it' },
          { status: 403 }
        );
      }

      // Insert verification comment if provided
      let commentId: string | null = null;
      if (body.verification_comment?.trim()) {
        const { data: commentRow } = await db.from('pep_comments').insert({
          task_id: id,
          author_id: user.id,
          body: body.verification_comment.trim(),
          context: 'verification',
        }).select('id').single();
        commentId = commentRow?.id || null;
      }

      // Insert into pep_verifications
      const { error: verifyInsertErr } = await db.from('pep_verifications').insert({
        task_id: id,
        verifier_id: user.id,
        verifier_role: requirements.availableSlot,
        rating,
        comment_id: commentId,
      });

      if (verifyInsertErr) {
        console.error('Error inserting verification:', verifyInsertErr);
        return NextResponse.json({ error: 'Failed to save verification' }, { status: 500 });
      }

      // Log verification activity
      await db.from('pep_activity_log').insert({
        task_id: id,
        user_id: user.id,
        action: 'verified',
        details: { slot: requirements.availableSlot, rating },
      });

      // Check if all slots are now filled
      const updatedSlots = [
        ...(existingVerifications || []),
        { verifier_role: requirements.availableSlot },
      ];
      const fullyVerified = isFullyVerified(
        currentTask.delegated_to,
        currentTask.assigned_by,
        currentTask.assigned_to,
        updatedSlots
      );

      if (fullyVerified) {
        // Compute average rating from all verifications
        const { data: allVerifications } = await db
          .from('pep_verifications')
          .select('rating')
          .eq('task_id', id);
        const ratings = (allVerifications || []).map((v: { rating: number }) => v.rating);
        const avgRating = Math.round(ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length);

        updates.status = 'verified';
        updates.verified_by = user.id;
        updates.verified_at = new Date().toISOString();
        updates.verification_rating = avgRating;
      } else {
        // Partial verification — task stays completed, just bump updated_at
        updates.updated_at = new Date().toISOString();
      }

      // Flag to skip duplicate activity logging and bypass "no changes" guard
      body._verificationSubmitted = true;
    } else {
      // Non-verification status changes (open, in_progress, etc.)
      updates.status = body.status;
      activityDetails.from = currentTask.status;
      activityDetails.to = body.status;
    }

    // If reopening from completed, clear completed_at and delete partial verifications
    if (body.status === 'in_progress' && currentTask.status === 'completed') {
      updates.completed_at = null;
      await db.from('pep_verifications').delete().eq('task_id', id);
    }
  }

  // Handle other field updates (admin+ only)
  if (isAdmin(user.role)) {
    // 5D: Enforce creator-only + 24h window for field edits (super_admin bypasses)
    const hasFieldEdits = ['title', 'description', 'assigned_to', 'due_date', 'priority'].some(
      (f) => body[f] !== undefined && body[f] !== (currentTask as Record<string, unknown>)[f]
    );
    if (hasFieldEdits && user.role !== 'super_admin') {
      if (user.id !== currentTask.assigned_by || !isWithinEditWindow(currentTask.created_at)) {
        return NextResponse.json(
          { error: 'Only the task creator can edit fields within 24 hours' },
          { status: 403 }
        );
      }
    }

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

  if (Object.keys(updates).length === 0 && !body._verificationSubmitted) {
    return NextResponse.json({ error: 'No changes to apply' }, { status: 400 });
  }

  updates.updated_at = updates.updated_at || new Date().toISOString();

  let updatedTask = currentTask;
  if (Object.keys(updates).length > 0) {
    const { data, error } = await db
      .from('pep_tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating task:', error);
      return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
    }
    updatedTask = data;
  }

  // Log activity (skip for verification — it has its own logging above)
  if (!body._verificationSubmitted) {
    const action = body.status && body.status !== currentTask.status
      ? 'status_changed'
      : 'updated';

    await db.from('pep_activity_log').insert({
      task_id: id,
      user_id: user.id,
      action,
      details: activityDetails,
    });
  }

  // Push notifications (fire-and-forget)
  // 1. Task completed → notify assigner
  if (body.status === 'completed' && currentTask.assigned_by && currentTask.assigned_by !== user.id) {
    sendPushNotification(currentTask.assigned_by, {
      title: 'Task Completed',
      body: currentTask.title,
      url: `/tasks/${id}`,
    });
  }

  // 2. Reassigned → notify new assignee
  if (updates.assigned_to && updates.assigned_to !== user.id && updates.assigned_to !== currentTask.assigned_to) {
    sendPushNotification(updates.assigned_to as string, {
      title: 'Task Assigned to You',
      body: currentTask.title,
      url: `/tasks/${id}`,
    });
  }

  // 3. Delegated → notify delegate
  if (updates.delegated_to && updates.delegated_to !== user.id) {
    sendPushNotification(updates.delegated_to as string, {
      title: 'Task Delegated to You',
      body: currentTask.title,
      url: `/tasks/${id}`,
    });
  }

  // Include fullyVerified flag for verification responses
  if (body._verificationSubmitted) {
    return NextResponse.json({ ...updatedTask, _fullyVerified: updates.status === 'verified' });
  }

  return NextResponse.json(updatedTask);
}

// DELETE /api/tasks/[id] — delete a task (creator only, within 24h, not verified)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: 'Only admins can delete tasks' }, { status: 403 });
  }

  const db = createServiceRoleClient();

  const { data: task } = await db
    .from('pep_tasks')
    .select('*')
    .eq('id', id)
    .eq('is_archived', false)
    .single();

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (task.status === 'verified') {
    return NextResponse.json({ error: 'Verified tasks cannot be deleted' }, { status: 400 });
  }

  if (!canCreatorDelete(user.id, task.assigned_by, task.created_at)) {
    return NextResponse.json({ error: 'Only the task creator can delete within 24 hours' }, { status: 403 });
  }

  // Clean up attachment storage files before cascade-deleting rows
  const { data: attachments } = await db
    .from('pep_attachments')
    .select('storage_path')
    .eq('task_id', id);

  if (attachments && attachments.length > 0) {
    const paths = attachments.map((a: { storage_path: string }) => a.storage_path);
    await db.storage.from('pep-attachments').remove(paths);
  }

  // Delete related records first (in case no CASCADE)
  await db.from('pep_verifications').delete().eq('task_id', id);
  await db.from('pep_activity_log').delete().eq('task_id', id);
  await db.from('pep_comments').delete().eq('task_id', id);
  await db.from('pep_attachments').delete().eq('task_id', id);

  const { error } = await db
    .from('pep_tasks')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting task:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
