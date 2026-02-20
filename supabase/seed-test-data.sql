-- ============================================
-- PEP Tasks — Test Seed Data
-- Run this in Supabase SQL Editor to create
-- dummy users, tasks, and activity for testing.
-- Safe to run multiple times (uses ON CONFLICT).
-- ============================================

-- 1. Dummy Users (across all roles)
-- Rahul (super_admin) should already exist from schema.sql

INSERT INTO pep_users (email, name, role) VALUES
  ('priya@pepschoolv2.com', 'Priya Sharma', 'admin'),
  ('amit@pepschoolv2.com', 'Amit Patel', 'staff'),
  ('neha@pepschoolv2.com', 'Neha Gupta', 'staff'),
  ('vikram@pepschoolv2.com', 'Vikram Singh', 'staff')
ON CONFLICT (email) DO NOTHING;

-- 2. Sample Tasks (assigned across users)
-- We need user IDs, so we use subqueries

-- Task 1: Open, assigned to Amit, due next week
INSERT INTO pep_tasks (title, description, status, priority, assigned_to, assigned_by, due_date)
SELECT
  'Prepare assembly schedule',
  'Create the assembly schedule for next month and share with all teachers.',
  'open',
  'high',
  (SELECT id FROM pep_users WHERE email = 'amit@pepschoolv2.com'),
  (SELECT id FROM pep_users WHERE email = 'rahul@pepschoolv2.com'),
  CURRENT_DATE + INTERVAL '5 days';

-- Task 2: In Progress, assigned to Neha, due this week
INSERT INTO pep_tasks (title, description, status, priority, assigned_to, assigned_by, due_date)
SELECT
  'Update student attendance tracker',
  'Fix the formula errors in the shared attendance spreadsheet.',
  'in_progress',
  'normal',
  (SELECT id FROM pep_users WHERE email = 'neha@pepschoolv2.com'),
  (SELECT id FROM pep_users WHERE email = 'priya@pepschoolv2.com'),
  CURRENT_DATE + INTERVAL '2 days';

-- Task 3: Completed (pending verification), assigned to Vikram
INSERT INTO pep_tasks (title, description, status, priority, assigned_to, assigned_by, due_date, completed_at)
SELECT
  'Submit field trip permission forms',
  'Collect and submit all signed permission forms to the office.',
  'completed',
  'urgent',
  (SELECT id FROM pep_users WHERE email = 'vikram@pepschoolv2.com'),
  (SELECT id FROM pep_users WHERE email = 'rahul@pepschoolv2.com'),
  CURRENT_DATE - INTERVAL '1 day',
  now() - INTERVAL '3 hours';

-- Task 4: Overdue, assigned to Amit
INSERT INTO pep_tasks (title, description, status, priority, assigned_to, assigned_by, due_date)
SELECT
  'Order science lab supplies',
  'Place the order for chemicals and equipment listed in the shared doc.',
  'open',
  'high',
  (SELECT id FROM pep_users WHERE email = 'amit@pepschoolv2.com'),
  (SELECT id FROM pep_users WHERE email = 'priya@pepschoolv2.com'),
  CURRENT_DATE - INTERVAL '3 days';

-- Task 5: Verified, assigned to Neha (fully done)
INSERT INTO pep_tasks (title, description, status, priority, assigned_to, assigned_by, due_date, completed_at, verified_by, verified_at)
SELECT
  'Print parent-teacher meeting invites',
  'Print 200 copies of the PTM invite letter.',
  'verified',
  'normal',
  (SELECT id FROM pep_users WHERE email = 'neha@pepschoolv2.com'),
  (SELECT id FROM pep_users WHERE email = 'rahul@pepschoolv2.com'),
  CURRENT_DATE - INTERVAL '5 days',
  now() - INTERVAL '2 days',
  (SELECT id FROM pep_users WHERE email = 'rahul@pepschoolv2.com'),
  now() - INTERVAL '1 day';

-- 3. Activity Log entries (so the timeline has data)

-- "created" entries for each task
INSERT INTO pep_activity_log (task_id, user_id, action, details, created_at)
SELECT t.id, t.assigned_by, 'created',
  jsonb_build_object('title', t.title, 'assigned_to', t.assigned_to, 'priority', t.priority),
  t.created_at
FROM pep_tasks t
WHERE t.title IN (
  'Prepare assembly schedule',
  'Update student attendance tracker',
  'Submit field trip permission forms',
  'Order science lab supplies',
  'Print parent-teacher meeting invites'
);

-- Status change: "Update student attendance tracker" went Open → In Progress
INSERT INTO pep_activity_log (task_id, user_id, action, details, created_at)
SELECT t.id,
  (SELECT id FROM pep_users WHERE email = 'neha@pepschoolv2.com'),
  'status_changed',
  '{"from": "open", "to": "in_progress"}'::jsonb,
  now() - INTERVAL '6 hours'
FROM pep_tasks t WHERE t.title = 'Update student attendance tracker';

-- Status change: "Submit field trip permission forms" went Open → In Progress → Completed
INSERT INTO pep_activity_log (task_id, user_id, action, details, created_at)
SELECT t.id,
  (SELECT id FROM pep_users WHERE email = 'vikram@pepschoolv2.com'),
  'status_changed',
  '{"from": "open", "to": "in_progress"}'::jsonb,
  now() - INTERVAL '8 hours'
FROM pep_tasks t WHERE t.title = 'Submit field trip permission forms';

INSERT INTO pep_activity_log (task_id, user_id, action, details, created_at)
SELECT t.id,
  (SELECT id FROM pep_users WHERE email = 'vikram@pepschoolv2.com'),
  'status_changed',
  '{"from": "in_progress", "to": "completed"}'::jsonb,
  now() - INTERVAL '3 hours'
FROM pep_tasks t WHERE t.title = 'Submit field trip permission forms';

-- Status change: "Print parent-teacher meeting invites" went through full lifecycle
INSERT INTO pep_activity_log (task_id, user_id, action, details, created_at)
SELECT t.id,
  (SELECT id FROM pep_users WHERE email = 'neha@pepschoolv2.com'),
  'status_changed',
  '{"from": "open", "to": "in_progress"}'::jsonb,
  now() - INTERVAL '3 days'
FROM pep_tasks t WHERE t.title = 'Print parent-teacher meeting invites';

INSERT INTO pep_activity_log (task_id, user_id, action, details, created_at)
SELECT t.id,
  (SELECT id FROM pep_users WHERE email = 'neha@pepschoolv2.com'),
  'status_changed',
  '{"from": "in_progress", "to": "completed"}'::jsonb,
  now() - INTERVAL '2 days'
FROM pep_tasks t WHERE t.title = 'Print parent-teacher meeting invites';

INSERT INTO pep_activity_log (task_id, user_id, action, details, created_at)
SELECT t.id,
  (SELECT id FROM pep_users WHERE email = 'rahul@pepschoolv2.com'),
  'status_changed',
  '{"from": "completed", "to": "verified"}'::jsonb,
  now() - INTERVAL '1 day'
FROM pep_tasks t WHERE t.title = 'Print parent-teacher meeting invites';

-- Done! You should now see:
-- 4 dummy users + Rahul = 5 total users
-- 5 tasks in various statuses (open, in_progress, completed, verified, overdue)
-- ~12 activity log entries showing up on the dashboard timeline
