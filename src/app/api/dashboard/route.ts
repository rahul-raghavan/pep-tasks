import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { isAdmin, getVerificationRequirements } from '@/lib/permissions';
import { startOfWeek, endOfWeek } from 'date-fns';
import { getTodayIST } from '@/lib/utils';
import { TimelineItem, TaskStatus, DashboardComment } from '@/types/database';
import { getCenterUserIds } from '@/lib/centers';
import { formatDisplayName } from '@/lib/format-name';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServiceRoleClient();
  const today = getTodayIST();
  // Parse today in IST to get correct week boundaries
  const todayDate = new Date(today + 'T00:00:00+05:30');
  const weekStart = startOfWeek(todayDate, { weekStartsOn: 1 }).toISOString().split('T')[0];
  const weekEnd = endOfWeek(todayDate, { weekStartsOn: 1 }).toISOString().split('T')[0];

  const isStaff = user.role === 'staff';

  // For admin: compute visible user IDs (center members minus super_admins)
  let adminVisibleUserIds: string[] | null = null;
  if (user.role === 'admin') {
    const centerUserIds = await getCenterUserIds(db, user.id);
    const allCandidates = centerUserIds.length > 0
      ? [...new Set([...centerUserIds, user.id])]
      : [user.id];

    // Exclude super_admin users from visible set
    const { data: superAdmins } = await db
      .from('pep_users')
      .select('id')
      .eq('role', 'super_admin');
    const excludeIds = new Set((superAdmins || []).map((u: { id: string }) => u.id));
    adminVisibleUserIds = allCandidates.filter((id) => !excludeIds.has(id));
  }

  // Single query for all active tasks — count open, due this week, and overdue in JS
  let activeQuery = db
    .from('pep_tasks')
    .select('id, due_date')
    .eq('is_archived', false)
    .in('status', ['open', 'in_progress']);
  if (isStaff) activeQuery = activeQuery.or(`assigned_to.eq.${user.id},delegated_to.eq.${user.id}`);
  if (user.role === 'admin' && adminVisibleUserIds) {
    activeQuery = adminVisibleUserIds.length > 0
      ? activeQuery.in('assigned_to', adminVisibleUserIds)
      : activeQuery.eq('assigned_to', '00000000-0000-0000-0000-000000000000');
  }

  // Timeline: recent status changes
  let timelinePromise: Promise<TimelineItem[]>;

  if (isStaff) {
    // Two-step: get task IDs assigned to or delegated to user, then filter activity
    timelinePromise = (async () => {
      const { data: taskRows } = await db
        .from('pep_tasks')
        .select('id')
        .eq('is_archived', false)
        .or(`assigned_to.eq.${user.id},delegated_to.eq.${user.id}`);
      const taskIds = (taskRows || []).map((t: { id: string }) => t.id);
      if (taskIds.length === 0) return [];

      const { data: logs } = await db
        .from('pep_activity_log')
        .select('id, task_id, user_id, action, details, created_at')
        .in('action', ['created', 'status_changed', 'delegated', 'undelegated', 'verified', 'attachment_added'])
        .in('task_id', taskIds)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!logs || logs.length === 0) return [];
      return await enrichTimeline(db, logs);
    })();
  } else {
    // Admin/super_admin: fetch recent status changes, then post-filter
    timelinePromise = (async () => {
      const { data: logs } = await db
        .from('pep_activity_log')
        .select('id, task_id, user_id, action, details, created_at')
        .in('action', ['created', 'status_changed', 'delegated', 'undelegated', 'verified', 'attachment_added'])
        .order('created_at', { ascending: false })
        .limit(50); // fetch extra for post-filtering

      if (!logs || logs.length === 0) return [];

      const items = await enrichTimeline(db, logs);

      if (user.role === 'super_admin') return items.slice(0, 10);

      // Admin: filter to tasks where assigned_to is in visible user IDs or assigned_by is me
      const taskIds = [...new Set(items.map((i) => i.task_id))];
      const { data: tasks } = await db
        .from('pep_tasks')
        .select('id, assigned_to, assigned_by')
        .in('id', taskIds);

      const visibleSet = new Set(adminVisibleUserIds || []);
      const allowedTasks = new Set(
        (tasks || [])
          .filter((t: { assigned_to: string | null; assigned_by: string | null }) =>
            (t.assigned_to && visibleSet.has(t.assigned_to)) || t.assigned_by === user.id
          )
          .map((t: { id: string }) => t.id)
      );

      return items.filter((i) => allowedTasks.has(i.task_id)).slice(0, 10);
    })();
  }

  // Pending verification count — personalized: tasks where THIS user has a pending slot
  let pendingVerificationPromise: Promise<number> | null = null;
  if (isAdmin(user.role)) {
    pendingVerificationPromise = (async () => {
      // Fetch completed tasks visible to this user
      let pvQuery = db
        .from('pep_tasks')
        .select('id, assigned_by, assigned_to, delegated_to')
        .eq('is_archived', false)
        .eq('status', 'completed');
      if (user.role === 'admin' && adminVisibleUserIds) {
        pvQuery = adminVisibleUserIds.length > 0
          ? pvQuery.in('assigned_to', adminVisibleUserIds)
          : pvQuery.eq('assigned_to', '00000000-0000-0000-0000-000000000000');
      }
      const { data: completedTasks } = await pvQuery;
      if (!completedTasks || completedTasks.length === 0) return 0;

      // Fetch existing verifications for those tasks
      const taskIds = completedTasks.map((t: { id: string }) => t.id);
      const { data: existingVerifications } = await db
        .from('pep_verifications')
        .select('task_id, verifier_role')
        .in('task_id', taskIds);

      // Group verifications by task
      const verificationsByTask = new Map<string, Array<{ verifier_role: string }>>();
      for (const v of (existingVerifications || [])) {
        const existing = verificationsByTask.get(v.task_id) || [];
        existing.push({ verifier_role: v.verifier_role });
        verificationsByTask.set(v.task_id, existing);
      }

      // Count tasks where this user can verify
      let count = 0;
      for (const task of completedTasks) {
        const slots = verificationsByTask.get(task.id) || [];
        const req = getVerificationRequirements(
          user.role,
          user.id,
          task.assigned_by,
          task.assigned_to,
          task.delegated_to,
          slots
        );
        if (req.canVerify) count++;
      }
      return count;
    })();
  }

  // "Your Tasks" — tasks assigned to me OR delegated to me (active, not verified)
  const myTasksPromise = db
    .from('pep_tasks')
    .select('id, title, status, priority, due_date, assigned_to, assigned_by')
    .eq('is_archived', false)
    .or(`assigned_to.eq.${user.id},delegated_to.eq.${user.id}`)
    .in('status', ['open', 'in_progress', 'completed'])
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(10);

  // "Assigned by You" — tasks I created for others OR tasks assigned to me that I delegated
  const assignedByMePromise = isAdmin(user.role)
    ? db
        .from('pep_tasks')
        .select('id, title, status, priority, due_date, assigned_to, assigned_by, delegated_to')
        .eq('is_archived', false)
        .or(`and(assigned_by.eq.${user.id},assigned_to.neq.${user.id}),and(assigned_to.eq.${user.id},delegated_to.not.is.null)`)
        .in('status', ['open', 'in_progress', 'completed'])
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(10)
    : Promise.resolve({ data: null });

  // Recent comments: fetch comments on visible tasks
  const recentCommentsPromise: Promise<DashboardComment[]> = (async () => {
    // Get visible task IDs based on role
    let visibleTaskQuery = db
      .from('pep_tasks')
      .select('id, title')
      .eq('is_archived', false)
      .in('status', ['open', 'in_progress', 'completed', 'verified']);

    if (isStaff) {
      visibleTaskQuery = visibleTaskQuery.or(`assigned_to.eq.${user.id},delegated_to.eq.${user.id}`);
    } else if (user.role === 'admin' && adminVisibleUserIds) {
      if (adminVisibleUserIds.length === 0) {
        visibleTaskQuery = visibleTaskQuery.or(`assigned_to.eq.${user.id},assigned_by.eq.${user.id}`);
      } else {
        visibleTaskQuery = visibleTaskQuery.or(
          `assigned_to.in.(${adminVisibleUserIds.join(',')}),assigned_by.eq.${user.id}`
        );
      }
    }
    // super_admin: no additional filter (sees all)

    const { data: visibleTasks } = await visibleTaskQuery.limit(200);
    if (!visibleTasks || visibleTasks.length === 0) return [];

    const taskIds = visibleTasks.map((t: { id: string }) => t.id);
    const taskTitleMap = new Map(
      visibleTasks.map((t: { id: string; title: string }) => [t.id, t.title])
    );

    // Fetch 10 most recent comments on those tasks
    const { data: comments } = await db
      .from('pep_comments')
      .select('id, task_id, author_id, body, context, created_at')
      .in('task_id', taskIds)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!comments || comments.length === 0) return [];

    // Resolve author names
    const authorIds = [...new Set(comments.map((c: { author_id: string }) => c.author_id))];
    const { data: authors } = await db
      .from('pep_users')
      .select('id, name, email')
      .in('id', authorIds);

    const authorMap = new Map(
      (authors || []).map((u: { id: string; name: string | null; email: string }) => [
        u.id,
        formatDisplayName(u.name, u.email),
      ])
    );

    return comments.map((c: { id: string; task_id: string; author_id: string; body: string; context: string | null; created_at: string }) => ({
      id: c.id,
      task_id: c.task_id,
      task_title: taskTitleMap.get(c.task_id) || 'Unknown Task',
      author_name: authorMap.get(c.author_id) || 'Unknown',
      body: c.body,
      context: c.context,
      created_at: c.created_at,
    }));
  })();

  const [activeRes, timeline, pendingVerificationCount, myTasksRes, assignedByMeRes, recentComments] = await Promise.all([
    activeQuery,
    timelinePromise,
    pendingVerificationPromise,
    myTasksPromise,
    assignedByMePromise,
    recentCommentsPromise,
  ]);

  // Derive counts from the single active tasks query
  const activeTasks = activeRes.data || [];
  const openCount = activeTasks.length;
  let dueThisWeekCount = 0;
  let overdueCount = 0;
  for (const t of activeTasks) {
    if (t.due_date) {
      if (t.due_date < today) overdueCount++;
      if (t.due_date >= weekStart && t.due_date <= weekEnd) dueThisWeekCount++;
    }
  }

  // For "Assigned by You", resolve assignee and delegate names
  let assignedByMe: Array<Record<string, unknown>> = [];
  if (assignedByMeRes.data && assignedByMeRes.data.length > 0) {
    const userIdsToResolve = [
      ...assignedByMeRes.data.map((t: { assigned_to: string | null }) => t.assigned_to),
      ...assignedByMeRes.data.map((t: { delegated_to: string | null }) => t.delegated_to),
    ].filter(Boolean);
    const uniqueIds = [...new Set(userIdsToResolve)] as string[];
    let nameMap = new Map<string, string>();
    if (uniqueIds.length > 0) {
      const { data: resolvedUsers } = await db
        .from('pep_users')
        .select('id, name, email')
        .in('id', uniqueIds);
      nameMap = new Map(
        (resolvedUsers || []).map((u: { id: string; name: string | null; email: string }) => [u.id, formatDisplayName(u.name, u.email)])
      );
    }
    assignedByMe = assignedByMeRes.data.map((t: Record<string, unknown>) => ({
      ...t,
      assigned_to_name: nameMap.get(t.assigned_to as string) || null,
      delegated_to_name: t.delegated_to ? (nameMap.get(t.delegated_to as string) || null) : null,
    }));
  }

  return NextResponse.json({
    open: openCount,
    dueThisWeek: dueThisWeekCount,
    overdue: overdueCount,
    timeline,
    myTasks: myTasksRes.data || [],
    assignedByMe,
    recentComments,
    ...(pendingVerificationCount != null ? { pendingVerification: pendingVerificationCount } : {}),
  });
}

interface RawLog {
  id: string;
  task_id: string;
  user_id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

async function enrichTimeline(
  db: ReturnType<typeof createServiceRoleClient>,
  logs: RawLog[]
): Promise<TimelineItem[]> {
  const taskIds = [...new Set(logs.map((l) => l.task_id))];
  const userIds = [...new Set(logs.map((l) => l.user_id))];

  const [{ data: tasks }, { data: users }] = await Promise.all([
    db.from('pep_tasks').select('id, title, assigned_to, assigned_by, due_date').in('id', taskIds),
    db.from('pep_users').select('id, name, email').in('id', userIds),
  ]);

  const taskMap = new Map((tasks || []).map((t: { id: string; title: string; assigned_to: string | null; assigned_by: string | null; due_date: string | null }) => [t.id, t]));
  const userMap = new Map(
    (users || []).map((u: { id: string; name: string | null; email: string }) => [
      u.id,
      formatDisplayName(u.name, u.email),
    ])
  );

  // Collect assignee IDs from tasks that aren't already in userMap
  const assigneeIds = [...new Set(
    (tasks || [])
      .map((t: { assigned_to: string | null }) => t.assigned_to)
      .filter((id): id is string => !!id && !userMap.has(id))
  )];

  if (assigneeIds.length > 0) {
    const { data: assigneeUsers } = await db
      .from('pep_users')
      .select('id, name, email')
      .in('id', assigneeIds);
    (assigneeUsers || []).forEach((u: { id: string; name: string | null; email: string }) => {
      userMap.set(u.id, formatDisplayName(u.name, u.email));
    });
  }

  return logs.map((l) => {
    const taskData = taskMap.get(l.task_id);
    return {
      id: l.id,
      task_id: l.task_id,
      task_title: taskData?.title || (l.details?.title as string) || 'Unknown Task',
      actor_name: userMap.get(l.user_id) || 'Unknown',
      action: l.action as TimelineItem['action'],
      from_status: (l.details?.from as TaskStatus) || null,
      to_status: (l.details?.to as TaskStatus) || null,
      assigned_to_id: taskData?.assigned_to || null,
      assigned_to_name: taskData?.assigned_to ? (userMap.get(taskData.assigned_to) || null) : null,
      assigned_by_id: taskData?.assigned_by || null,
      due_date: taskData?.due_date || null,
      delegated_to_name: (l.details?.to_name as string) || null,
      created_at: l.created_at,
    };
  });
}
