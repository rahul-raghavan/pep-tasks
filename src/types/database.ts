export type UserRole = 'super_admin' | 'admin' | 'staff';

export type TaskStatus = 'open' | 'in_progress' | 'completed' | 'verified';

export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';

export interface PepCenter {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PepUserCenter {
  id: string;
  user_id: string;
  center_id: string;
  created_at: string;
}

export interface PepUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  auth_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  centers?: PepCenter[];
}

export interface PepVerification {
  id: string;
  task_id: string;
  verifier_id: string;
  verifier_role: 'assigned_by' | 'assigned_to';
  rating: number;
  comment_id: string | null;
  created_at: string;
  // Joined
  verifier_name?: string;
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
  verification_rating: number | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  assignee?: PepUser;
  assigner?: PepUser;
  delegate?: PepUser;
  verifications?: PepVerification[];
}

export interface PepComment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  context: string | null;
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
  action: 'created' | 'status_changed' | 'delegated' | 'undelegated' | 'verified' | 'attachment_added';
  from_status: TaskStatus | null;
  to_status: TaskStatus | null;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  assigned_by_id: string | null;
  due_date: string | null;
  delegated_to_name: string | null;
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

export interface DashboardComment {
  id: string;
  task_id: string;
  task_title: string;
  author_name: string;
  body: string;
  context: string | null;
  created_at: string;
}

export interface PepAttachment {
  id: string;
  task_id: string;
  uploaded_by: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  created_at: string;
  // Joined
  uploader?: PepUser;
}

// Shared across apps (no Pep prefix) — keyed by auth.users.id
export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  auth_key: string;
  p256dh_key: string;
  created_at: string;
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
