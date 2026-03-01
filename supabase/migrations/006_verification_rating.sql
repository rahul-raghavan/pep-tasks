-- Add star rating (1-5) for task verification
ALTER TABLE pep_tasks ADD COLUMN IF NOT EXISTS verification_rating INTEGER
  CHECK (verification_rating IS NULL OR (verification_rating >= 1 AND verification_rating <= 5));
