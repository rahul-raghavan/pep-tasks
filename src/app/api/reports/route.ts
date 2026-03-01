import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isAdmin, canViewReportsFor } from '@/lib/permissions';
import { getCurrentUser } from '@/lib/auth';
import { UserRole } from '@/types/database';
import { startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { getTodayIST } from '@/lib/utils';
import { getCenterUserIds } from '@/lib/centers';
import { formatDisplayName } from '@/lib/format-name';

interface PersonReport {
  user_id: string;
  name: string;
  email: string;
  role: UserRole;
  assigned: number;
  completed: number;
  verified: number;
  on_time: number;
  late: number;
  overdue: number;
  avg_rating?: number | null;
}

// GET /api/reports?month=2026-02
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get('month') || new Date().toISOString().slice(0, 7);

  const monthStart = startOfMonth(parseISO(`${monthParam}-01`));
  const monthEnd = endOfMonth(monthStart);
  const monthStartStr = monthStart.toISOString();
  const monthEndStr = monthEnd.toISOString();

  const db = createServiceRoleClient();

  // Get all users visible to this role
  let usersQuery = db
    .from('pep_users')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (user.role === 'admin') {
    usersQuery = usersQuery.in('role', ['admin', 'staff']);
  }

  const { data: allUsers } = await usersQuery;
  if (!allUsers) return NextResponse.json([]);

  // Admin: filter to only users in their centers (+ self)
  let visibleUsers = allUsers;
  if (user.role === 'admin') {
    const centerUserIds = await getCenterUserIds(db, user.id);
    const visibleSet = new Set(centerUserIds.length > 0 ? [...centerUserIds, user.id] : [user.id]);
    visibleUsers = allUsers.filter((u) => visibleSet.has(u.id));
  }

  // Get all tasks created in this month
  const { data: tasks } = await db
    .from('pep_tasks')
    .select('*')
    .gte('created_at', monthStartStr)
    .lte('created_at', monthEndStr);

  const taskList = tasks || [];
  const today = getTodayIST();

  const reports: PersonReport[] = visibleUsers
    .filter((u) => canViewReportsFor(user.role, u.role))
    .map((u) => {
      const userTasks = taskList.filter((t) => t.assigned_to === u.id);
      const completed = userTasks.filter(
        (t) => t.status === 'completed' || t.status === 'verified'
      );
      const verified = userTasks.filter((t) => t.status === 'verified');

      // On-time: completed before or on due date
      const onTime = completed.filter(
        (t) =>
          t.due_date &&
          t.completed_at &&
          t.completed_at.split('T')[0] <= t.due_date
      );

      // Late: completed after due date
      const late = completed.filter(
        (t) =>
          t.due_date &&
          t.completed_at &&
          t.completed_at.split('T')[0] > t.due_date
      );

      // Overdue: not completed and past due date
      const overdue = userTasks.filter(
        (t) =>
          t.due_date &&
          t.due_date < today &&
          t.status !== 'completed' &&
          t.status !== 'verified'
      );

      const report: PersonReport = {
        user_id: u.id,
        name: formatDisplayName(u.name, u.email),
        email: u.email,
        role: u.role,
        assigned: userTasks.length,
        completed: completed.length,
        verified: verified.length,
        on_time: onTime.length,
        late: late.length,
        overdue: overdue.length,
      };

      // Avg rating: only for super_admins
      if (user.role === 'super_admin') {
        const ratedTasks = verified.filter(
          (t) => t.verification_rating != null && t.verification_rating > 0
        );
        if (ratedTasks.length > 0) {
          const sum = ratedTasks.reduce(
            (acc: number, t) => acc + (t.verification_rating as number),
            0
          );
          report.avg_rating = Math.round((sum / ratedTasks.length) * 10) / 10;
        } else {
          report.avg_rating = null;
        }
      }

      return report;
    });

  return NextResponse.json(reports);
}
