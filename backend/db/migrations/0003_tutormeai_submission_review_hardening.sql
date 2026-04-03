BEGIN;

ALTER TABLE apps
  ADD COLUMN review_state text NOT NULL DEFAULT 'submitted',
  ADD COLUMN last_review_record_id text;

ALTER TABLE apps
  ADD CONSTRAINT apps_review_state_valid
  CHECK (review_state IN ('draft', 'submitted', 'validation-failed', 'review-pending', 'approved-staging', 'approved-production', 'rejected', 'suspended', 'retired'));

CREATE INDEX idx_apps_review_state
  ON apps (review_state, distribution, auth_type);

ALTER TABLE app_versions
  ADD COLUMN submission_package_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN review_state text NOT NULL DEFAULT 'submitted',
  ADD COLUMN runtime_review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN reviewed_by_user_id text REFERENCES users (user_id),
  ADD COLUMN reviewer_notes text,
  ADD COLUMN last_review_record_id text,
  ADD COLUMN submitted_at timestamptz NOT NULL DEFAULT NOW(),
  ADD COLUMN decided_at timestamptz;

ALTER TABLE app_versions
  ADD CONSTRAINT app_versions_submission_is_object
  CHECK (jsonb_typeof(submission_package_json) = 'object');

ALTER TABLE app_versions
  ADD CONSTRAINT app_versions_review_state_valid
  CHECK (review_state IN ('draft', 'submitted', 'validation-failed', 'review-pending', 'approved-staging', 'approved-production', 'rejected', 'suspended', 'retired'));

ALTER TABLE app_versions
  ADD CONSTRAINT app_versions_runtime_review_status_valid
  CHECK (runtime_review_status IN ('pending', 'approved', 'blocked'));

CREATE INDEX idx_app_versions_review_state
  ON app_versions (review_state, runtime_review_status, created_at DESC);

ALTER TABLE apps
  ADD CONSTRAINT fk_apps_last_review_record
  FOREIGN KEY (last_review_record_id)
  REFERENCES app_review_records (app_review_record_id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE app_versions
  ADD CONSTRAINT fk_app_versions_last_review_record
  FOREIGN KEY (last_review_record_id)
  REFERENCES app_review_records (app_review_record_id)
  DEFERRABLE INITIALLY DEFERRED;

COMMIT;
