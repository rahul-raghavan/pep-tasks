import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { startOfWeek, endOfWeek } from 'date-fns';
import { getTodayIST } from '@/lib/utils';
import { TimelineItem, TaskStatus } from '@/types/database';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createServiceRoleClient();
  const today = getTodayIST();
  // Parse today in IST to get correct week boundaries
  const todayDate = new Date(today + 'T00:00:00+05:30');
  const weekStart = startOfWeek(todayDate, { weekStartsOn: 1 }).toISOString().split('T')[0];
  const weekEnd = endOfWeek(todayDate, { weekStartsOn: 1 }).toISOString().split('T')[0];

  // Build base query filter based on role
  const isStaff = user.role === 'staff';

  // Open tasks
  let openQuery = db
    .from('pep_tasks')
    .select('id', { count: 'exact', head: true })
    .in('status', ['open', 'in_progress']);
  if (isStaff) openQuery = openQuery.or(`assigned_to.eq.${user.id},delegated_to.eq.${user.id}`);

  // Due this week
  let weekQuery = db
    .from('pep_tasks')
    .select('id', { count: 'exact', head: true })
    .in('status', ['open', 'in_progress'])
    .gte('due_date', weekStart)
    .lte('due_date', weekEnd);
  if (isStaff) weekQuery = weekQuery.or(`assigned_to.eq.${user.id},delegated_to.eq.${user.id}`);

  // Overdue
  let overdueQuery = db
    .from('pep_tasks')
    .select('id', { count: 'exact', head: true })
    .in('status', ['open', 'in_progress'])
    .lt('due_date', today);
  if (isStaff) overdueQuery = overdueQuery.or(`assigned_to.eq.${user.id},delegated_to.eq.${user.id}`);

  // Timeline: recent status changes
  let timelinePromise: Promise<TimelineItem[]>;

  if (isStaff) {
    // Two-step: get task IDs assigned to or delegated to user, then filter activity
    timelinePromise = (async () => {
      const { data: taskRows } = await db
        .from('pep_tasks')
        .select('id')
        .or(`assigned_to.eq.${user.id},delegated_to.eq.${user.id}`);
      const taskIds = (taskRows || []).map((t: { id: string }) => t.id);
      if (taskIds.length === 0) return [];

      const { data: logs } = await db
        .from('pep_activity_log')
        .select('id, task_id, user_id, action, details, created_at')
        .in('action', ['created', 'status_changed'])
        .in('task_id', taskIds)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!logs || logs.length === 0) return [];
      return await enrichTimeline(db, logs);
    })();
  } else {
    // Admin/super_admin: fetch recent status changes, then post-filter for admin
    timelinePromise = (async () => {
      const { data: logs } = await db
        .from('pep_activity_log')
        .select('id, task_id, user_id, action, details, created_at')
        .in('action', ['created', 'status_changed'])
        .order('created_at', { ascending: false })
        .limit(50); // fetch extra for post-filtering

      if (!logs || logs.length === 0) return [];

      const items = await enrichTimeline(db, logs);

      if (user.role === 'super_admin') return items.slice(0, 10);

      // Admin: filter to tasks assigned to admin or staff roles
      const taskIds = [...new Set(items.map((i) => i.task_id))];
      const { data: tasks } = await db
        .from('pep_tasks')
        .select('id, assigned_to')
        .in('id', taskIds);

      const assigneeIds = [...new Set((tasks || []).map((t: { assigned_to: string | null }) => t.assigned_to).filter(Boolean))];
      const { data: assignees } = await db
        .from('pep_users')
        .select('id, role')
        .in('id', assigneeIds as string[]);

      const allowedRoles = new Set(['admin', 'staff']);
      const allowedAssignees = new Set((assignees || []).filter((a: { role: string }) => allowedRoles.has(a.role)).map((a: { id: string }) => a.id));
      const allowedTasks = new Set((tasks || []).filter((t: { assigned_to: string | null }) => t.assigned_to && allowedAssignees.has(t.assigned_to)).map((t: { id: string }) => t.id));

      return items.filter((i) => allowedTasks.has(i.task_id)).slice(0, 10);
    })();
  }

  const [openRes, weekRes, overdueRes, timeline] = await Promise.all([
    openQuery,
    weekQuery,
    overdueQuery,
    timelinePromise,
  ]);

  return NextResponse.json({
    open: openRes.count || 0,
    dueThisWeek: weekRes.count || 0,
    overdue: overdueRes.count || 0,
    timeline,
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
    db.from('pep_tasks').select('id, title').in('id', taskIds),
    db.from('pep_users').select('id, name, email').in('id', userIds),
  ]);

  const taskMap = new Map((tasks || []).map((t: { id: string; title: string }) => [t.id, t.title]));
  const userMap = new Map(
    (users || []).map((u: { id: string; name: string | null; email: string }) => [
      u.id,
      u.name || u.email.split('@')[0],
    ])
  );

  return logs.map((l) => ({
    id: l.id,
    task_id: l.task_id,
    task_title: taskMap.get(l.task_id) || (l.details?.title as string) || 'Unknown Task',
    actor_name: userMap.get(l.user_id) || 'Unknown',
    action: l.action as 'created' | 'status_changed',
    from_status: (l.details?.from as TaskStatus) || null,
    to_status: (l.details?.to as TaskStatus) || null,
    created_at: l.created_at,
  }));
}
