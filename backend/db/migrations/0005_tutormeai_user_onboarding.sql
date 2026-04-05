ALTER TABLE users
  ADD COLUMN username text,
  ADD COLUMN role text,
  ADD COLUMN onboarding_completed_at timestamptz;

ALTER TABLE users
  ADD CONSTRAINT users_username_present CHECK (username IS NULL OR LENGTH(TRIM(username)) > 0),
  ADD CONSTRAINT users_role_valid CHECK (role IS NULL OR role IN ('student', 'teacher', 'school_admin', 'district_Director')),
  ADD CONSTRAINT users_onboarding_requires_profile CHECK (
    onboarding_completed_at IS NULL
    OR (role IS NOT NULL AND username IS NOT NULL)
  );

CREATE UNIQUE INDEX idx_users_username_unique
  ON users (LOWER(username))
  WHERE username IS NOT NULL AND deleted_at IS NULL;
