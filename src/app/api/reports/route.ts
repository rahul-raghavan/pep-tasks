import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isAdmin, canViewReportsFor } from '@/lib/permissions';
import { getCurrentUser } from '@/lib/auth';
import { UserRole } from '@/types/database';
import { startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { getTodayIST } from '@/lib/utils';

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

  // Get all tasks created in this month
  const { data: tasks } = await db
    .from('pep_tasks')
    .select('*')
    .gte('created_at', monthStartStr)
    .lte('created_at', monthEndStr);

  const taskList = tasks || [];
  const today = getTodayIST();

  const reports: PersonReport[] = allUsers
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

      return {
        user_id: u.id,
        name: u.name || u.email.split('@')[0],
        email: u.email,
        role: u.role,
        assigned: userTasks.length,
        completed: completed.length,
        verified: verified.length,
        on_time: onTime.length,
        late: late.length,
        overdue: overdue.length,
      };
    });

  return NextResponse.json(reports);
}
