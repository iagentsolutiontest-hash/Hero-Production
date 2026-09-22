-- PostgreSQL Row Level Security for multi-tenant isolation.
-- App sets: app.current_organization_id, app.current_user_id
-- Admin/migrate/auth: app.bypass_rls = on

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.should_bypass_rls() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.bypass_rls', true), ''), 'off') = 'on';
$$;

CREATE OR REPLACE FUNCTION app.current_org_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_organization_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$;

-- organizations
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organizations_isolation ON organizations;
CREATE POLICY organizations_isolation ON organizations
  FOR ALL
  USING (
    app.should_bypass_rls()
    OR id = app.current_org_id()
    OR EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.organization_id = organizations.id
        AND m.user_id = app.current_user_id()
        AND m.is_active = TRUE
    )
  )
  WITH CHECK (
    app.should_bypass_rls()
    OR id = app.current_org_id()
    OR app.current_user_id() IS NOT NULL  -- allow creating a new org when authenticated
  );

-- memberships
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memberships_isolation ON memberships;
CREATE POLICY memberships_isolation ON memberships
  FOR ALL
  USING (
    app.should_bypass_rls()
    OR user_id = app.current_user_id()
    OR organization_id = app.current_org_id()
  )
  WITH CHECK (
    app.should_bypass_rls()
    OR organization_id = app.current_org_id()
    OR user_id = app.current_user_id()
  );

-- roles
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS roles_isolation ON roles;
CREATE POLICY roles_isolation ON roles
  FOR ALL
  USING (
    app.should_bypass_rls()
    OR organization_id IS NULL
    OR organization_id = app.current_org_id()
  )
  WITH CHECK (
    app.should_bypass_rls()
    OR organization_id IS NULL
    OR organization_id = app.current_org_id()
  );

-- permissions (global)
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS permissions_read ON permissions;
CREATE POLICY permissions_read ON permissions
  FOR SELECT
  USING (TRUE);
DROP POLICY IF EXISTS permissions_write ON permissions;
CREATE POLICY permissions_write ON permissions
  FOR ALL
  USING (app.should_bypass_rls())
  WITH CHECK (app.should_bypass_rls());

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_permissions_read ON role_permissions;
CREATE POLICY role_permissions_read ON role_permissions
  FOR SELECT
  USING (TRUE);
DROP POLICY IF EXISTS role_permissions_write ON role_permissions;
CREATE POLICY role_permissions_write ON role_permissions
  FOR ALL
  USING (app.should_bypass_rls())
  WITH CHECK (app.should_bypass_rls());

-- Standard organization_id tables
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies', 'accounts', 'journal_entries', 'contacts', 'invoices', 'bills',
    'bank_accounts', 'bank_transactions', 'payments', 'employees', 'payslips',
    'recurring_invoices', 'stripe_sessions'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skip missing table %', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL
         USING (app.should_bypass_rls() OR organization_id = app.current_org_id())
         WITH CHECK (app.should_bypass_rls() OR organization_id = app.current_org_id())',
      t || '_isolation', t
    );
  END LOOP;
END $$;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_isolation ON audit_logs;
CREATE POLICY audit_logs_isolation ON audit_logs
  FOR ALL
  USING (
    app.should_bypass_rls()
    OR organization_id = app.current_org_id()
    OR (organization_id IS NULL AND user_id = app.current_user_id())
  )
  WITH CHECK (
    app.should_bypass_rls()
    OR organization_id = app.current_org_id()
    OR organization_id IS NULL
  );

-- Child tables
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS journal_lines_isolation ON journal_lines;
CREATE POLICY journal_lines_isolation ON journal_lines
  FOR ALL
  USING (
    app.should_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.id = journal_lines.journal_entry_id AND je.organization_id = app.current_org_id()
    )
  )
  WITH CHECK (
    app.should_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.id = journal_lines.journal_entry_id AND je.organization_id = app.current_org_id()
    )
  );

ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_lines_isolation ON invoice_lines;
CREATE POLICY invoice_lines_isolation ON invoice_lines
  FOR ALL
  USING (
    app.should_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_lines.invoice_id AND i.organization_id = app.current_org_id()
    )
  )
  WITH CHECK (
    app.should_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_lines.invoice_id AND i.organization_id = app.current_org_id()
    )
  );

ALTER TABLE bill_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bill_lines_isolation ON bill_lines;
CREATE POLICY bill_lines_isolation ON bill_lines
  FOR ALL
  USING (
    app.should_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM bills b
      WHERE b.id = bill_lines.bill_id AND b.organization_id = app.current_org_id()
    )
  )
  WITH CHECK (
    app.should_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM bills b
      WHERE b.id = bill_lines.bill_id AND b.organization_id = app.current_org_id()
    )
  );

-- users: login needs bypass; authenticated self-access
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_self ON users;
CREATE POLICY users_self ON users
  FOR ALL
  USING (app.should_bypass_rls() OR id = app.current_user_id())
  WITH CHECK (app.should_bypass_rls() OR id = app.current_user_id());

ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS refresh_tokens_self ON refresh_tokens;
CREATE POLICY refresh_tokens_self ON refresh_tokens
  FOR ALL
  USING (app.should_bypass_rls() OR user_id = app.current_user_id())
  WITH CHECK (app.should_bypass_rls() OR user_id = app.current_user_id());
