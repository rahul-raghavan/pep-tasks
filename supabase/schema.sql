-- PEP Tasks — Database Schema
-- All tables prefixed with pep_ to share Supabase project with other apps

-- ============================================
-- pep_users: User registry
-- ============================================
CREATE TABLE IF NOT EXISTS pep_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('super_admin', 'admin', 'staff')),
  auth_id UUID, -- filled on first Google login
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for pep_users
ALTER TABLE pep_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pep_users"
  ON pep_users FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role can manage pep_users"
  ON pep_users FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ============================================
-- pep_tasks: Core task table
-- ============================================
CREATE TABLE IF NOT EXISTS pep_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'verified')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  assigned_to UUID REFERENCES pep_users(id),
  assigned_by UUID REFERENCES pep_users(id),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  verified_by UUID REFERENCES pep_users(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE pep_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pep_tasks"
  ON pep_tasks FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role can manage pep_tasks"
  ON pep_tasks FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ============================================
-- pep_comments: Comment thread per task
-- ============================================
CREATE TABLE IF NOT EXISTS pep_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES pep_tasks(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES pep_users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE pep_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pep_comments"
  ON pep_comments FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role can manage pep_comments"
  ON pep_comments FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ============================================
-- pep_activity_log: Auto-tracked audit trail
-- ============================================
CREATE TABLE IF NOT EXISTS pep_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES pep_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES pep_users(id),
  action TEXT NOT NULL, -- e.g. 'created', 'status_changed', 'reassigned', 'due_date_changed'
  details JSONB, -- e.g. {"from": "open", "to": "in_progress"}
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE pep_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pep_activity_log"
  ON pep_activity_log FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role can manage pep_activity_log"
  ON pep_activity_log FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_pep_tasks_assigned_to ON pep_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_pep_tasks_status ON pep_tasks(status);
CREATE INDEX IF NOT EXISTS idx_pep_tasks_due_date ON pep_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_pep_comments_task_id ON pep_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_pep_activity_log_task_id ON pep_activity_log(task_id);
CREATE INDEX IF NOT EXISTS idx_pep_users_email ON pep_users(email);

-- ============================================
-- Seed: Add Rahul as super admin
-- ============================================
-- ============================================
-- pep_recurring_tasks: Recurring task templates
-- ============================================
CREATE TABLE IF NOT EXISTS pep_recurring_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES pep_users(id),
  assigned_by UUID REFERENCES pep_users(id),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  recurrence_rule JSONB NOT NULL,
  next_run_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE pep_recurring_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pep_recurring_tasks"
  ON pep_recurring_tasks FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role can manage pep_recurring_tasks"
  ON pep_recurring_tasks FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_pep_recurring_active_next
  ON pep_recurring_tasks (next_run_date) WHERE is_active = true;

-- ============================================
-- Seed: Add Rahul as super admin
-- ============================================
INSERT INTO pep_users (email, name, role)
VALUES ('rahul@pepschoolv2.com', 'Rahul', 'super_admin')
ON CONFLICT (email) DO NOTHING;
