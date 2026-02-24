-- Migration: Centers system + verification comment context
-- Run in Supabase SQL editor

-- 1. Add context column to pep_comments (for 'verification' markers)
ALTER TABLE pep_comments ADD COLUMN IF NOT EXISTS context TEXT;

-- 2. Create pep_centers table
CREATE TABLE IF NOT EXISTS pep_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create pep_user_centers junction table
CREATE TABLE IF NOT EXISTS pep_user_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES pep_users(id) ON DELETE CASCADE,
  center_id UUID NOT NULL REFERENCES pep_centers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, center_id)
);

CREATE INDEX IF NOT EXISTS idx_pep_user_centers_user ON pep_user_centers(user_id);
CREATE INDEX IF NOT EXISTS idx_pep_user_centers_center ON pep_user_centers(center_id);

-- 4. Seed centers
INSERT INTO pep_centers (name) VALUES
  ('HSR'),
  ('Whitefield'),
  ('Varthur'),
  ('Sarjapura'),
  ('Kokapet')
ON CONFLICT (name) DO NOTHING;

-- 5. RLS policies
ALTER TABLE pep_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE pep_user_centers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on pep_centers"
  ON pep_centers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on pep_user_centers"
  ON pep_user_centers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
