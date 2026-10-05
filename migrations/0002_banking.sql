-- Phase 3: banking & reconciliation.
-- Mirrors an equivalent addition to prisma/schema.prisma (kept in sync by
-- hand for the same reason as 0001_init.sql — see docs/DATABASE.md).

CREATE TYPE bank_transaction_status AS ENUM ('UNMATCHED', 'MATCHED', 'RECONCILED');

CREATE TABLE bank_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  gl_account_id    UUID NOT NULL REFERENCES accounts(id),
  name             TEXT NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'AUD',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bank_accounts_org ON bank_accounts(organization_id);

CREATE TABLE bank_transactions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  bank_account_id    UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  txn_date           TIMESTAMPTZ NOT NULL,
  description        TEXT NOT NULL,
  -- Positive = money in (deposit), negative = money out (withdrawal).
  amount             NUMERIC(20,8) NOT NULL,
  status             bank_transaction_status NOT NULL DEFAULT 'UNMATCHED',
  matched_invoice_id UUID REFERENCES invoices(id),
  matched_bill_id    UUID REFERENCES bills(id),
  journal_entry_id   UUID REFERENCES journal_entries(id),
  categorized_account_id UUID REFERENCES accounts(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bank_transactions_org ON bank_transactions(organization_id);
CREATE INDEX idx_bank_transactions_status ON bank_transactions(organization_id, status);
