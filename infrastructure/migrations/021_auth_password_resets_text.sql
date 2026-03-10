-- Password reset tokens for company-scoped auth users.

CREATE TABLE IF NOT EXISTS auth_password_resets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_password_resets_company_id
  ON auth_password_resets(company_id);

CREATE INDEX IF NOT EXISTS idx_auth_password_resets_user_id
  ON auth_password_resets(user_id);

CREATE INDEX IF NOT EXISTS idx_auth_password_resets_email
  ON auth_password_resets(company_id, email);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_auth_password_resets_tenant_companies'
  ) THEN
    ALTER TABLE auth_password_resets
      ADD CONSTRAINT fk_auth_password_resets_tenant_companies
      FOREIGN KEY (company_id) REFERENCES tenant_companies(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_auth_password_resets_auth_users'
  ) THEN
    ALTER TABLE auth_password_resets
      ADD CONSTRAINT fk_auth_password_resets_auth_users
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;
  END IF;
END $$;
