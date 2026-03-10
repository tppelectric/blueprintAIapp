-- Company-scoped authentication users for app sign-in.
-- Keeps IDs as TEXT to align with active schema chain.

CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'estimator', 'viewer')),
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, email)
);

CREATE INDEX IF NOT EXISTS idx_auth_users_company_id
  ON auth_users(company_id);

CREATE INDEX IF NOT EXISTS idx_auth_users_company_email
  ON auth_users(company_id, email);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_auth_users_tenant_companies'
  ) THEN
    ALTER TABLE auth_users
      ADD CONSTRAINT fk_auth_users_tenant_companies
      FOREIGN KEY (company_id) REFERENCES tenant_companies(id) ON DELETE CASCADE;
  END IF;
END $$;
