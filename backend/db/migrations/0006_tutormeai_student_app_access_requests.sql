CREATE TABLE IF NOT EXISTS app_access_requests (
  app_access_request_id text PRIMARY KEY,
  app_id text NOT NULL,
  app_name text NOT NULL,
  student_user_id text NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  student_display_name text NOT NULL,
  student_email text,
  student_role text,
  status text NOT NULL DEFAULT 'pending',
  decision_reason text,
  decided_by_user_id text REFERENCES users (user_id),
  decided_by_display_name text,
  requested_at timestamptz NOT NULL DEFAULT NOW(),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT app_access_requests_app_id_present CHECK (LENGTH(TRIM(app_id)) > 0),
  CONSTRAINT app_access_requests_app_name_present CHECK (LENGTH(TRIM(app_name)) > 0),
  CONSTRAINT app_access_requests_student_display_name_present CHECK (LENGTH(TRIM(student_display_name)) > 0),
  CONSTRAINT app_access_requests_student_role_valid CHECK (
    student_role IS NULL OR student_role IN ('student', 'teacher', 'school_admin', 'district_Director')
  ),
  CONSTRAINT app_access_requests_status_valid CHECK (status IN ('pending', 'approved', 'declined')),
  CONSTRAINT app_access_requests_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT app_access_requests_decision_requires_reviewer CHECK (
    status = 'pending'
    OR (decided_by_user_id IS NOT NULL AND decided_by_display_name IS NOT NULL AND decided_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_app_access_requests_student_app_created
  ON app_access_requests (student_user_id, app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_access_requests_status_updated
  ON app_access_requests (status, updated_at DESC);
