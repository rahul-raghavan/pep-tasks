import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { advanceNextRunDate } from '@/lib/recurrence';
import { getTodayIST } from '@/lib/utils';
import { RecurrenceRule } from '@/types/database';

export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sends this as Authorization: Bearer <secret>)
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createServiceRoleClient();
  const today = getTodayIST();

  // Get all active recurring tasks due today or earlier
  const { data: templates, error } = await db
    .from('pep_recurring_tasks')
    .select('*')
    .eq('is_active', true)
    .lte('next_run_date', today);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!templates || templates.length === 0) {
    return NextResponse.json({ generated: 0 });
  }

  let generated = 0;

  for (const template of templates) {
    // Create the task with due_date = the scheduled date
    const { data: task, error: taskError } = await db
      .from('pep_tasks')
      .insert({
        title: template.title,
        description: template.description,
        assigned_to: template.assigned_to,
        assigned_by: template.assigned_by,
        priority: template.priority,
        due_date: template.next_run_date,
        status: 'open',
      })
      .select('id')
      .single();

    if (taskError || !task) continue;

    // Log activity
    if (template.assigned_by) {
      await db.from('pep_activity_log').insert({
        task_id: task.id,
        user_id: template.assigned_by,
        action: 'created',
        details: { source: 'recurring', recurring_task_id: template.id },
      });
    }

    // Advance next_run_date
    const rule = template.recurrence_rule as RecurrenceRule;
    const currentDate = new Date(template.next_run_date + 'T00:00:00');
    const nextDate = advanceNextRunDate(currentDate, rule);
    const nextDateStr = nextDate.toISOString().split('T')[0];

    await db
      .from('pep_recurring_tasks')
      .update({ next_run_date: nextDateStr, updated_at: new Date().toISOString() })
      .eq('id', template.id);

    generated++;
  }

  return NextResponse.json({ generated });
}
