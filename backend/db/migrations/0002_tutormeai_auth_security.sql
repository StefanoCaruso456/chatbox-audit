BEGIN;

CREATE TABLE platform_sessions (
  platform_session_id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (user_id),
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  session_token_hash text NOT NULL,
  refresh_token_hash text NOT NULL,
  token_version integer NOT NULL DEFAULT 1,
  session_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  issued_at timestamptz NOT NULL,
  last_used_at timestamptz,
  last_refreshed_at timestamptz,
  revoked_at timestamptz,
  user_agent text,
  ip_address text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_sessions_provider_present CHECK (LENGTH(TRIM(provider)) > 0),
  CONSTRAINT platform_sessions_status_valid CHECK (status IN ('active', 'expired', 'revoked')),
  CONSTRAINT platform_sessions_token_version_positive CHECK (token_version >= 1),
  CONSTRAINT platform_sessions_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT platform_sessions_expiry_order CHECK (refresh_expires_at >= session_expires_at)
);

ALTER TABLE platform_sessions
  ADD CONSTRAINT uq_platform_sessions_session_token_hash UNIQUE (session_token_hash);

ALTER TABLE platform_sessions
  ADD CONSTRAINT uq_platform_sessions_refresh_token_hash UNIQUE (refresh_token_hash);

CREATE INDEX idx_platform_sessions_user_status
  ON platform_sessions (user_id, status, updated_at DESC);

CREATE INDEX idx_platform_sessions_refresh_expiry
  ON platform_sessions (status, refresh_expires_at);

ALTER TABLE oauth_connections
  ADD COLUMN authorization_state_hash text;

UPDATE oauth_connections
SET authorization_state_hash = oauth_connection_id
WHERE authorization_state_hash IS NULL;

ALTER TABLE oauth_connections
  ALTER COLUMN authorization_state_hash SET NOT NULL;

ALTER TABLE oauth_connections
  ADD COLUMN authorization_url text;

UPDATE oauth_connections
SET authorization_url = 'about:blank'
WHERE authorization_url IS NULL;

ALTER TABLE oauth_connections
  ALTER COLUMN authorization_url SET NOT NULL;

ALTER TABLE oauth_connections
  ADD COLUMN authorization_expires_at timestamptz;

ALTER TABLE oauth_connections
  ADD COLUMN code_verifier_ciphertext text;

ALTER TABLE oauth_connections
  ADD COLUMN requested_scopes text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE oauth_connections
  ADD CONSTRAINT oauth_connections_authorization_state_present CHECK (LENGTH(TRIM(authorization_state_hash)) > 0);

ALTER TABLE oauth_connections
  ADD CONSTRAINT oauth_connections_authorization_url_present CHECK (LENGTH(TRIM(authorization_url)) > 0);

ALTER TABLE oauth_connections
  ADD CONSTRAINT uq_oauth_connections_authorization_state_hash UNIQUE (authorization_state_hash);

CREATE INDEX idx_oauth_connections_state_expiry
  ON oauth_connections (status, authorization_expires_at);

CREATE TRIGGER trg_platform_sessions_updated_at
BEFORE UPDATE ON platform_sessions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

COMMIT;
