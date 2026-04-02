CREATE FUNCTION set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE users (
  user_id text PRIMARY KEY,
  email text,
  display_name text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  deleted_at timestamptz,
  CONSTRAINT users_email_present CHECK (email IS NULL OR LENGTH(TRIM(email)) > 0)
);

CREATE UNIQUE INDEX idx_users_email_unique
  ON users (LOWER(email))
  WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE conversations (
  conversation_id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (user_id),
  title text,
  status text NOT NULL DEFAULT 'active',
  active_app_session_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_message_at timestamptz,
  last_activity_at timestamptz NOT NULL DEFAULT NOW(),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  archived_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT conversations_status_valid CHECK (status IN ('active', 'archived', 'deleted')),
  CONSTRAINT conversations_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX idx_conversations_user_updated
  ON conversations (user_id, updated_at DESC);

CREATE INDEX idx_conversations_status_updated
  ON conversations (status, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE messages (
  message_id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES conversations (conversation_id) ON DELETE CASCADE,
  user_id text REFERENCES users (user_id),
  role text NOT NULL,
  sequence_no bigint NOT NULL,
  content_text text,
  content_parts_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT messages_role_valid CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  CONSTRAINT messages_content_parts_is_array CHECK (jsonb_typeof(content_parts_json) = 'array'),
  CONSTRAINT messages_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT messages_sequence_positive CHECK (sequence_no >= 0)
);

ALTER TABLE messages
  ADD CONSTRAINT uq_messages_conversation_sequence UNIQUE (conversation_id, sequence_no);

CREATE INDEX idx_messages_conversation_created
  ON messages (conversation_id, created_at DESC);

CREATE TABLE apps (
  app_id text PRIMARY KEY,
  slug text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  distribution text NOT NULL,
  auth_type text NOT NULL,
  review_status text NOT NULL DEFAULT 'pending',
  current_version_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  archived_at timestamptz,
  CONSTRAINT apps_slug_present CHECK (LENGTH(TRIM(slug)) > 0),
  CONSTRAINT apps_name_present CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT apps_distribution_valid CHECK (distribution IN ('internal', 'public-external', 'authenticated-external')),
  CONSTRAINT apps_auth_type_valid CHECK (auth_type IN ('none', 'platform-session', 'oauth2')),
  CONSTRAINT apps_review_status_valid CHECK (review_status IN ('pending', 'approved', 'blocked')),
  CONSTRAINT apps_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object')
);

ALTER TABLE apps
  ADD CONSTRAINT uq_apps_slug UNIQUE (slug);

CREATE INDEX idx_apps_review_distribution
  ON apps (review_status, distribution, auth_type);

CREATE TABLE app_versions (
  app_version_id text PRIMARY KEY,
  app_id text NOT NULL REFERENCES apps (app_id),
  version text NOT NULL,
  manifest_json jsonb NOT NULL,
  tool_definitions_json jsonb NOT NULL,
  ui_embed_config_json jsonb NOT NULL,
  allowed_origins_json jsonb NOT NULL,
  auth_config_json jsonb,
  safety_metadata_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  published_at timestamptz,
  CONSTRAINT app_versions_version_present CHECK (LENGTH(TRIM(version)) > 0),
  CONSTRAINT app_versions_manifest_is_object CHECK (jsonb_typeof(manifest_json) = 'object'),
  CONSTRAINT app_versions_tools_is_array CHECK (jsonb_typeof(tool_definitions_json) = 'array'),
  CONSTRAINT app_versions_embed_is_object CHECK (jsonb_typeof(ui_embed_config_json) = 'object'),
  CONSTRAINT app_versions_origins_is_array CHECK (jsonb_typeof(allowed_origins_json) = 'array'),
  CONSTRAINT app_versions_auth_is_object_or_null CHECK (auth_config_json IS NULL OR jsonb_typeof(auth_config_json) = 'object'),
  CONSTRAINT app_versions_safety_is_object CHECK (jsonb_typeof(safety_metadata_json) = 'object')
);

ALTER TABLE app_versions
  ADD CONSTRAINT uq_app_versions_app_version UNIQUE (app_id, version);

ALTER TABLE app_versions
  ADD CONSTRAINT uq_app_versions_app_version_id UNIQUE (app_id, app_version_id);

CREATE INDEX idx_app_versions_app_created
  ON app_versions (app_id, created_at DESC);

ALTER TABLE apps
  ADD CONSTRAINT fk_apps_current_version
  FOREIGN KEY (app_id, current_version_id)
  REFERENCES app_versions (app_id, app_version_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE app_review_records (
  app_review_record_id text PRIMARY KEY,
  app_id text NOT NULL REFERENCES apps (app_id),
  app_version_id text,
  reviewed_by_user_id text REFERENCES users (user_id),
  review_status text NOT NULL,
  age_rating text NOT NULL,
  data_access_level text NOT NULL,
  permissions_snapshot_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  decided_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT app_review_records_status_valid CHECK (review_status IN ('pending', 'approved', 'blocked')),
  CONSTRAINT app_review_records_age_rating_valid CHECK (age_rating IN ('all-ages', '13+', '16+', '18+')),
  CONSTRAINT app_review_records_data_access_valid CHECK (data_access_level IN ('minimal', 'moderate', 'sensitive')),
  CONSTRAINT app_review_records_permissions_is_array CHECK (jsonb_typeof(permissions_snapshot_json) = 'array'),
  CONSTRAINT app_review_records_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX idx_app_review_records_app_created
  ON app_review_records (app_id, created_at DESC);

CREATE INDEX idx_app_review_records_status_created
  ON app_review_records (review_status, created_at DESC);

ALTER TABLE app_review_records
  ADD CONSTRAINT fk_app_review_records_app_version
  FOREIGN KEY (app_id, app_version_id)
  REFERENCES app_versions (app_id, app_version_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE oauth_connections (
  oauth_connection_id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (user_id),
  app_id text NOT NULL REFERENCES apps (app_id),
  provider text NOT NULL,
  status text NOT NULL,
  external_account_id text,
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  token_type text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  last_refreshed_at timestamptz,
  connected_at timestamptz,
  disconnected_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT oauth_connections_provider_present CHECK (LENGTH(TRIM(provider)) > 0),
  CONSTRAINT oauth_connections_status_valid CHECK (status IN ('pending', 'connected', 'expired', 'revoked', 'error')),
  CONSTRAINT oauth_connections_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object')
);

ALTER TABLE oauth_connections
  ADD CONSTRAINT uq_oauth_connections_user_app_provider UNIQUE (user_id, app_id, provider);

CREATE INDEX idx_oauth_connections_status_expiry
  ON oauth_connections (status, access_token_expires_at);

CREATE INDEX idx_oauth_connections_app_status
  ON oauth_connections (app_id, status);

CREATE TABLE app_sessions (
  app_session_id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES conversations (conversation_id),
  user_id text NOT NULL REFERENCES users (user_id),
  app_id text NOT NULL REFERENCES apps (app_id),
  app_version_id text,
  launch_tool_name text,
  launch_reason text NOT NULL,
  status text NOT NULL,
  auth_state text NOT NULL,
  is_active boolean NOT NULL DEFAULT TRUE,
  current_tool_call_id text,
  latest_sequence bigint NOT NULL DEFAULT 0,
  latest_snapshot_json jsonb,
  latest_state_digest_json jsonb,
  latest_summary text,
  completion_json jsonb,
  last_error_json jsonb,
  started_at timestamptz,
  last_active_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  resumable_until timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT app_sessions_launch_reason_valid CHECK (launch_reason IN ('chat-tool', 'resume-session', 'manual-open')),
  CONSTRAINT app_sessions_status_valid CHECK (status IN ('pending', 'active', 'paused', 'waiting-auth', 'waiting-user', 'completed', 'failed', 'expired', 'cancelled')),
  CONSTRAINT app_sessions_auth_state_valid CHECK (auth_state IN ('not-required', 'connected', 'required', 'expired')),
  CONSTRAINT app_sessions_latest_sequence_nonnegative CHECK (latest_sequence >= 0),
  CONSTRAINT app_sessions_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT app_sessions_snapshot_is_object_or_null CHECK (latest_snapshot_json IS NULL OR jsonb_typeof(latest_snapshot_json) = 'object'),
  CONSTRAINT app_sessions_digest_is_object_or_null CHECK (latest_state_digest_json IS NULL OR jsonb_typeof(latest_state_digest_json) = 'object'),
  CONSTRAINT app_sessions_completion_is_object_or_null CHECK (completion_json IS NULL OR jsonb_typeof(completion_json) = 'object'),
  CONSTRAINT app_sessions_error_is_object_or_null CHECK (last_error_json IS NULL OR jsonb_typeof(last_error_json) = 'object'),
  CONSTRAINT app_sessions_completed_at_order CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
);

CREATE INDEX idx_app_sessions_conversation_updated
  ON app_sessions (conversation_id, updated_at DESC);

CREATE INDEX idx_app_sessions_conversation_status
  ON app_sessions (conversation_id, status, updated_at DESC);

CREATE INDEX idx_app_sessions_user_status
  ON app_sessions (user_id, status, updated_at DESC);

CREATE INDEX idx_app_sessions_active
  ON app_sessions (conversation_id, updated_at DESC)
  WHERE is_active = TRUE;

CREATE INDEX idx_app_sessions_resumable_until
  ON app_sessions (resumable_until)
  WHERE resumable_until IS NOT NULL;

ALTER TABLE conversations
  ADD CONSTRAINT fk_conversations_active_app_session
  FOREIGN KEY (active_app_session_id)
  REFERENCES app_sessions (app_session_id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE app_sessions
  ADD CONSTRAINT fk_app_sessions_app_version
  FOREIGN KEY (app_id, app_version_id)
  REFERENCES app_versions (app_id, app_version_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE tool_invocations (
  tool_call_id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES conversations (conversation_id),
  app_session_id text REFERENCES app_sessions (app_session_id),
  user_id text NOT NULL REFERENCES users (user_id),
  app_id text NOT NULL REFERENCES apps (app_id),
  app_version_id text,
  request_message_id text REFERENCES messages (message_id),
  correlation_id text,
  tool_name text NOT NULL,
  invocation_mode text NOT NULL,
  auth_requirement text NOT NULL,
  status text NOT NULL,
  request_payload_json jsonb NOT NULL,
  response_payload_json jsonb,
  error_payload_json jsonb,
  result_summary text,
  queued_at timestamptz NOT NULL DEFAULT NOW(),
  started_at timestamptz,
  completed_at timestamptz,
  latency_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT tool_invocations_tool_name_present CHECK (LENGTH(TRIM(tool_name)) > 0),
  CONSTRAINT tool_invocations_mode_valid CHECK (invocation_mode IN ('platform-proxy', 'embedded-bridge')),
  CONSTRAINT tool_invocations_auth_requirement_valid CHECK (auth_requirement IN ('none', 'platform-session', 'app-oauth')),
  CONSTRAINT tool_invocations_status_valid CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'timed-out')),
  CONSTRAINT tool_invocations_request_is_object CHECK (jsonb_typeof(request_payload_json) = 'object'),
  CONSTRAINT tool_invocations_response_is_object_or_null CHECK (response_payload_json IS NULL OR jsonb_typeof(response_payload_json) = 'object'),
  CONSTRAINT tool_invocations_error_is_object_or_null CHECK (error_payload_json IS NULL OR jsonb_typeof(error_payload_json) = 'object'),
  CONSTRAINT tool_invocations_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT tool_invocations_latency_nonnegative CHECK (latency_ms IS NULL OR latency_ms >= 0),
  CONSTRAINT tool_invocations_completed_at_order CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
);

CREATE INDEX idx_tool_invocations_conversation_started
  ON tool_invocations (conversation_id, started_at DESC NULLS LAST, queued_at DESC);

CREATE INDEX idx_tool_invocations_session_started
  ON tool_invocations (app_session_id, started_at DESC NULLS LAST, queued_at DESC)
  WHERE app_session_id IS NOT NULL;

CREATE INDEX idx_tool_invocations_status_started
  ON tool_invocations (status, started_at DESC NULLS LAST, queued_at DESC);

CREATE INDEX idx_tool_invocations_app_tool_started
  ON tool_invocations (app_id, tool_name, started_at DESC NULLS LAST, queued_at DESC);

ALTER TABLE tool_invocations
  ADD CONSTRAINT fk_tool_invocations_app_version
  FOREIGN KEY (app_id, app_version_id)
  REFERENCES app_versions (app_id, app_version_id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE app_sessions
  ADD CONSTRAINT fk_app_sessions_current_tool_call
  FOREIGN KEY (current_tool_call_id)
  REFERENCES tool_invocations (tool_call_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER trg_conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER trg_apps_updated_at
BEFORE UPDATE ON apps
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER trg_oauth_connections_updated_at
BEFORE UPDATE ON oauth_connections
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER trg_app_sessions_updated_at
BEFORE UPDATE ON app_sessions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();
