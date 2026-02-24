import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCurrentUser, isAdmin, canAssignTo } from '@/lib/auth';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('pep_recurring_tasks')
    .select('*, assignee:pep_users!pep_recurring_tasks_assigned_to_fkey(*), assigner:pep_users!pep_recurring_tasks_assigned_by_fkey(*)')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Admin: filter out templates involving super_admins
  let results = data || [];
  if (user.role === 'admin') {
    results = results.filter((t: Record<string, unknown>) => {
      const assignee = (Array.isArray(t.assignee) ? t.assignee[0] : t.assignee) as { role?: string } | null;
      const assigner = (Array.isArray(t.assigner) ? t.assigner[0] : t.assigner) as { role?: string } | null;
      return assignee?.role !== 'super_admin' && assigner?.role !== 'super_admin';
    });
  }

  return NextResponse.json(results);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { title, description, assigned_to, priority, recurrence_rule, next_run_date } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  if (!recurrence_rule || !recurrence_rule.type) {
    return NextResponse.json({ error: 'Recurrence rule is required' }, { status: 400 });
  }
  if (!next_run_date) {
    return NextResponse.json({ error: 'First run date is required' }, { status: 400 });
  }

  // Permission check: can this user assign to the target?
  if (assigned_to) {
    const db = createServiceRoleClient();
    const { data: targetUser } = await db
      .from('pep_users')
      .select('role')
      .eq('id', assigned_to)
      .single();
    if (targetUser && !canAssignTo(user.role, targetUser.role)) {
      return NextResponse.json({ error: 'Cannot assign to this user' }, { status: 403 });
    }
  }

  const db = createServiceRoleClient();
  const { data, error } = await db
    .from('pep_recurring_tasks')
    .insert({
      title: title.trim(),
      description: description || null,
      assigned_to: assigned_to || null,
      assigned_by: user.id,
      priority: priority || 'normal',
      recurrence_rule,
      next_run_date,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
