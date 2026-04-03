BEGIN;

ALTER TABLE app_review_records
  ADD COLUMN review_state text NOT NULL DEFAULT 'submitted',
  ADD COLUMN decision_action text,
  ADD COLUMN decision_summary text,
  ADD COLUMN remediation_items_json jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE app_review_records
  ADD CONSTRAINT app_review_records_review_state_valid
  CHECK (review_state IN ('draft', 'submitted', 'validation-failed', 'review-pending', 'approved-staging', 'approved-production', 'rejected', 'suspended', 'retired'));

ALTER TABLE app_review_records
  ADD CONSTRAINT app_review_records_decision_action_valid
  CHECK (decision_action IS NULL OR decision_action IN ('start-review', 'approve-staging', 'approve-production', 'request-remediation', 'reject', 'suspend'));

ALTER TABLE app_review_records
  ADD CONSTRAINT app_review_records_remediation_items_is_array
  CHECK (jsonb_typeof(remediation_items_json) = 'array');

CREATE INDEX idx_app_review_records_state_created
  ON app_review_records (review_state, created_at DESC);

COMMIT;
