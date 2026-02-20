export type UserRole = 'super_admin' | 'admin' | 'staff';

export type TaskStatus = 'open' | 'in_progress' | 'completed' | 'verified';

export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';

export interface PepUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  auth_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PepTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to: string | null;
  assigned_by: string | null;
  delegated_to: string | null;
  due_date: string | null;
  completed_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  assignee?: PepUser;
  assigner?: PepUser;
  delegate?: PepUser;
}

export interface PepComment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  // Joined
  author?: PepUser;
}

export interface TimelineItem {
  id: string;
  task_id: string;
  task_title: string;
  actor_name: string;
  action: 'created' | 'status_changed';
  from_status: TaskStatus | null;
  to_status: TaskStatus | null;
  created_at: string;
}

export type RecurrenceType = 'daily' | 'weekly' | 'monthly';

export interface RecurrenceRule {
  type: RecurrenceType;
  interval: number;
  days?: number[];              // for weekly: 0=Sun, 1=Mon, ..., 6=Sat
  day?: number | string;        // for monthly: day number or "last_friday" etc.
}

export interface PepRecurringTask {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  assigned_by: string | null;
  priority: TaskPriority;
  recurrence_rule: RecurrenceRule;
  next_run_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  assignee?: PepUser;
  assigner?: PepUser;
}

export interface PepActivityLog {
  id: string;
  task_id: string;
  user_id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  // Joined
  user?: PepUser;
}
