-- 005: Composite indexes for hot query patterns

-- Task list & dashboard: filter by status + assigned_to (covers role-based filtering)
CREATE INDEX IF NOT EXISTS idx_pep_tasks_status_assigned
  ON pep_tasks(status, assigned_to);

-- Dashboard: overdue + due this week queries filter status + due_date
CREATE INDEX IF NOT EXISTS idx_pep_tasks_status_due_date
  ON pep_tasks(status, due_date);

-- Task list: filter by status + assigned_by (admin "assigned by me" queries)
CREATE INDEX IF NOT EXISTS idx_pep_tasks_status_assigned_by
  ON pep_tasks(status, assigned_by);

-- Comments: fetch by task ordered by created_at
CREATE INDEX IF NOT EXISTS idx_pep_comments_task_created
  ON pep_comments(task_id, created_at);

-- Activity log: fetch by task ordered by created_at desc
CREATE INDEX IF NOT EXISTS idx_pep_activity_log_task_created
  ON pep_activity_log(task_id, created_at DESC);

-- Activity log: dashboard timeline query filters by action + orders by created_at
CREATE INDEX IF NOT EXISTS idx_pep_activity_log_action_created
  ON pep_activity_log(action, created_at DESC);

-- Attachments: fetch by task ordered by created_at
CREATE INDEX IF NOT EXISTS idx_pep_attachments_task_created
  ON pep_attachments(task_id, created_at DESC);
