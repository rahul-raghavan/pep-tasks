-- 004: Push Subscriptions (shared across apps) + PEP Attachments

-- ============================================================
-- Push subscriptions — shared table (no pep_ prefix)
-- user_id references auth.users.id so any Supabase-auth app can share
-- ============================================================
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  auth_key TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for lookup by user
CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- RLS: service role only (API routes use service role client)
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on push_subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- PEP Attachments
-- ============================================================
CREATE TABLE pep_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES pep_tasks(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES pep_users(id),
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pep_attachments_task_id ON pep_attachments(task_id);

ALTER TABLE pep_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on pep_attachments"
  ON pep_attachments FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- Supabase Storage bucket for attachments
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pep-attachments',
  'pep-attachments',
  false,
  5242880,  -- 5 MB
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: service role only (we handle auth in API routes)
CREATE POLICY "Service role access on pep-attachments"
  ON storage.objects FOR ALL
  USING (bucket_id = 'pep-attachments' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'pep-attachments' AND auth.role() = 'service_role');
