-- Stripe payment tracking
CREATE TABLE IF NOT EXISTS stripe_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id         UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  stripe_session_id  TEXT NOT NULL UNIQUE,
  stripe_payment_intent_id TEXT,
  amount             NUMERIC(20,8) NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'AUD',
  status             TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | COMPLETED | EXPIRED | FAILED
  payment_id         UUID REFERENCES payments(id),
  journal_entry_id   UUID REFERENCES journal_entries(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ
);
CREATE INDEX idx_stripe_sessions_org ON stripe_sessions(organization_id);
CREATE INDEX idx_stripe_sessions_invoice ON stripe_sessions(invoice_id);
CREATE INDEX idx_stripe_sessions_stripe_id ON stripe_sessions(stripe_session_id);

-- Optional: store payment source on payments for audit
ALTER TABLE payments ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'BANK_MATCH';
-- BANK_MATCH | STRIPE | MANUAL
ALTER TABLE payments ADD COLUMN IF NOT EXISTS external_ref TEXT;
