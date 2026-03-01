-- 008: Add is_archived flag to pep_tasks
-- Allows hiding old tasks without deleting them (preserves all related data)

ALTER TABLE pep_tasks ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT false;

-- Index for fast filtering on the flag (most queries filter is_archived = false)
CREATE INDEX idx_pep_tasks_is_archived ON pep_tasks (is_archived) WHERE is_archived = false;
