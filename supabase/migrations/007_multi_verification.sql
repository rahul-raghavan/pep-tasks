-- Multi-verifier system: replaces single verified_by with per-slot verifications
-- For delegated tasks, both assigned_by AND assigned_to must verify.
-- For non-delegated tasks, only assigned_by verifies.
-- Super_admins can fill any pending slot.

CREATE TABLE IF NOT EXISTS pep_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES pep_tasks(id) ON DELETE CASCADE,
  verifier_id UUID NOT NULL REFERENCES pep_users(id),
  verifier_role TEXT NOT NULL CHECK (verifier_role IN ('assigned_by', 'assigned_to')),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment_id UUID REFERENCES pep_comments(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, verifier_role)
);

CREATE INDEX idx_pep_verifications_task_id ON pep_verifications(task_id);
CREATE INDEX idx_pep_verifications_verifier_id ON pep_verifications(verifier_id);

-- RLS: service_role only (same pattern as other pep_ tables)
ALTER TABLE pep_verifications ENABLE ROW LEVEL SECURITY;
