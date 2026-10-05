-- Hero Phase 1 schema.
-- This mirrors prisma/schema.prisma exactly. It exists because this sandbox
-- cannot reach binaries.prisma.sh to run `prisma migrate`; in an environment
-- with normal internet access, `npx prisma migrate dev` against
-- prisma/schema.prisma is the source of truth and this file becomes
-- redundant. Keep the two in sync until CI can run Prisma directly.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  full_name      TEXT NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  country_code  TEXT NOT NULL DEFAULT 'AU',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE companies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  registration_id  TEXT,
  base_currency    TEXT NOT NULL DEFAULT 'AUD',
  address          TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_companies_org ON companies(organization_id);

CREATE TABLE roles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  is_system        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE permissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key          TEXT UNIQUE NOT NULL,
  description  TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_id        UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id  UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE memberships (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_id          UUID NOT NULL REFERENCES roles(id),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id)
);
CREATE INDEX idx_memberships_org ON memberships(organization_id);

CREATE TYPE account_type AS ENUM ('ASSET','LIABILITY','EQUITY','REVENUE','COST_OF_GOODS_SOLD','EXPENSE');

CREATE TABLE accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,
  name             TEXT NOT NULL,
  type             account_type NOT NULL,
  parent_id        UUID REFERENCES accounts(id),
  is_system        BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);
CREATE INDEX idx_accounts_org ON accounts(organization_id);

CREATE TYPE journal_entry_status AS ENUM ('POSTED','REVERSED');

CREATE TABLE journal_entries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id         UUID,
  entry_date         TIMESTAMPTZ NOT NULL,
  description        TEXT NOT NULL,
  source_type        TEXT NOT NULL,
  source_id          TEXT,
  status             journal_entry_status NOT NULL DEFAULT 'POSTED',
  reverses_entry_id  UUID REFERENCES journal_entries(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_journal_entries_org_date ON journal_entries(organization_id, entry_date);
CREATE INDEX idx_journal_entries_source ON journal_entries(source_type, source_id);

CREATE TABLE journal_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id  UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id        UUID NOT NULL REFERENCES accounts(id),
  debit             NUMERIC(20,8) NOT NULL DEFAULT 0,
  credit            NUMERIC(20,8) NOT NULL DEFAULT 0,
  memo              TEXT
);
CREATE INDEX idx_journal_lines_entry ON journal_lines(journal_entry_id);
CREATE INDEX idx_journal_lines_account ON journal_lines(account_id);

CREATE TYPE contact_type AS ENUM ('CUSTOMER','SUPPLIER','BOTH');

CREATE TABLE contacts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type             contact_type NOT NULL,
  name             TEXT NOT NULL,
  email            TEXT,
  phone            TEXT,
  address          TEXT,
  tax_id           TEXT,
  currency         TEXT NOT NULL DEFAULT 'AUD',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_contacts_org ON contacts(organization_id);

CREATE TYPE invoice_status AS ENUM ('DRAFT','SENT','PARTIALLY_PAID','PAID','OVERDUE','VOID');

CREATE TABLE invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id       UUID NOT NULL REFERENCES contacts(id),
  invoice_number   TEXT NOT NULL,
  issue_date       TIMESTAMPTZ NOT NULL,
  due_date         TIMESTAMPTZ NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'AUD',
  status           invoice_status NOT NULL DEFAULT 'DRAFT',
  subtotal         NUMERIC(20,8) NOT NULL,
  tax_total        NUMERIC(20,8) NOT NULL,
  total            NUMERIC(20,8) NOT NULL,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, invoice_number)
);
CREATE INDEX idx_invoices_org_status ON invoices(organization_id, status);

CREATE TABLE invoice_lines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description  TEXT NOT NULL,
  quantity     NUMERIC(20,8) NOT NULL,
  unit_price   NUMERIC(20,8) NOT NULL,
  tax_rate     NUMERIC(5,4) NOT NULL,
  line_total   NUMERIC(20,8) NOT NULL
);
CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);

CREATE TYPE bill_status AS ENUM ('DRAFT','SUBMITTED','APPROVED','PARTIALLY_PAID','PAID');

CREATE TABLE bills (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id       UUID NOT NULL REFERENCES contacts(id),
  bill_number      TEXT NOT NULL,
  issue_date       TIMESTAMPTZ NOT NULL,
  due_date         TIMESTAMPTZ NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'AUD',
  status           bill_status NOT NULL DEFAULT 'DRAFT',
  subtotal         NUMERIC(20,8) NOT NULL,
  tax_total        NUMERIC(20,8) NOT NULL,
  total            NUMERIC(20,8) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, bill_number)
);

CREATE TABLE bill_lines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id      UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  description  TEXT NOT NULL,
  quantity     NUMERIC(20,8) NOT NULL,
  unit_price   NUMERIC(20,8) NOT NULL,
  tax_rate     NUMERIC(5,4) NOT NULL,
  line_total   NUMERIC(20,8) NOT NULL
);

CREATE TABLE audit_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID REFERENCES organizations(id) ON DELETE SET NULL,
  user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  action           TEXT NOT NULL,
  entity_type      TEXT,
  entity_id        TEXT,
  old_value        JSONB,
  new_value        JSONB,
  ip_address       TEXT,
  user_agent       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_org_date ON audit_logs(organization_id, created_at);
