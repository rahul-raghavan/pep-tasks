-- Migration: Fix overly permissive RLS policies
-- Previously all tables had USING (true) for authenticated role,
-- allowing any logged-in user to read ALL rows via Supabase REST API.
-- Now each table restricts authenticated users to their own data only.
-- All app API routes use service_role client, so they're unaffected.

-- ============================================
-- pep_users: only read your own profile
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read pep_users" ON pep_users;
CREATE POLICY "Authenticated users can read own profile"
  ON pep_users FOR SELECT
  TO authenticated USING (auth.uid() = auth_id);

-- ============================================
-- pep_tasks: only read tasks assigned to you
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read pep_tasks" ON pep_tasks;
CREATE POLICY "Authenticated users can read own assigned tasks"
  ON pep_tasks FOR SELECT
  TO authenticated USING (assigned_to IN (
    SELECT id FROM pep_users WHERE auth_id = auth.uid()
  ));

-- ============================================
-- pep_comments: only read comments on your tasks
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read pep_comments" ON pep_comments;
CREATE POLICY "Authenticated users can read comments on own tasks"
  ON pep_comments FOR SELECT
  TO authenticated USING (task_id IN (
    SELECT id FROM pep_tasks WHERE assigned_to IN (
      SELECT id FROM pep_users WHERE auth_id = auth.uid()
    )
  ));

-- ============================================
-- pep_activity_log: only read activity on your tasks
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read pep_activity_log" ON pep_activity_log;
CREATE POLICY "Authenticated users can read activity on own tasks"
  ON pep_activity_log FOR SELECT
  TO authenticated USING (task_id IN (
    SELECT id FROM pep_tasks WHERE assigned_to IN (
      SELECT id FROM pep_users WHERE auth_id = auth.uid()
    )
  ));

-- ============================================
-- pep_recurring_tasks: only read recurring tasks assigned to you
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read pep_recurring_tasks" ON pep_recurring_tasks;
CREATE POLICY "Authenticated users can read own recurring tasks"
  ON pep_recurring_tasks FOR SELECT
  TO authenticated USING (assigned_to IN (
    SELECT id FROM pep_users WHERE auth_id = auth.uid()
  ));
