-- Add delegation support to pep_tasks
ALTER TABLE pep_tasks ADD COLUMN IF NOT EXISTS delegated_to UUID REFERENCES pep_users(id);

CREATE INDEX IF NOT EXISTS idx_pep_tasks_delegated_to ON pep_tasks(delegated_to);

-- Update RLS policies to include delegated_to
-- Drop old select policy and recreate with delegation
DROP POLICY IF EXISTS "Authenticated users can read own assigned tasks" ON pep_tasks;
CREATE POLICY "Authenticated users can read own assigned or delegated tasks"
  ON pep_tasks FOR SELECT
  TO authenticated USING (
    assigned_to IN (SELECT id FROM pep_users WHERE auth_id = auth.uid())
    OR delegated_to IN (SELECT id FROM pep_users WHERE auth_id = auth.uid())
  );

-- Update comments RLS to include delegated tasks
DROP POLICY IF EXISTS "Authenticated users can read comments on own tasks" ON pep_comments;
CREATE POLICY "Authenticated users can read comments on own tasks"
  ON pep_comments FOR SELECT
  TO authenticated USING (task_id IN (
    SELECT id FROM pep_tasks WHERE
      assigned_to IN (SELECT id FROM pep_users WHERE auth_id = auth.uid())
      OR delegated_to IN (SELECT id FROM pep_users WHERE auth_id = auth.uid())
  ));

-- Update activity log RLS to include delegated tasks
DROP POLICY IF EXISTS "Authenticated users can read activity on own tasks" ON pep_activity_log;
CREATE POLICY "Authenticated users can read activity on own tasks"
  ON pep_activity_log FOR SELECT
  TO authenticated USING (task_id IN (
    SELECT id FROM pep_tasks WHERE
      assigned_to IN (SELECT id FROM pep_users WHERE auth_id = auth.uid())
      OR delegated_to IN (SELECT id FROM pep_users WHERE auth_id = auth.uid())
  ));
