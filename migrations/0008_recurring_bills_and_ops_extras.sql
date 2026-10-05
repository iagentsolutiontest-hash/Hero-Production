-- Recurring bills (mirrors recurring_invoices from 0004) so the
-- "Recurring bills" module has somewhere real to persist templates.
CREATE TABLE IF NOT EXISTS recurring_bills (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id       UUID NOT NULL REFERENCES contacts(id),
  frequency        TEXT NOT NULL DEFAULT 'MONTHLY', -- WEEKLY | MONTHLY | QUARTERLY
  next_run_date    DATE NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  line_template    JSONB NOT NULL, -- [{description, quantity, unitPrice, taxRateCode}]
  currency         TEXT NOT NULL DEFAULT 'AUD',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recurring_bills_org ON recurring_bills(organization_id);

ALTER TABLE recurring_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_bills FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recurring_bills_isolation ON recurring_bills;
CREATE POLICY recurring_bills_isolation ON recurring_bills
  FOR ALL
  USING (app.should_bypass_rls() OR organization_id = app.current_org_id())
  WITH CHECK (app.should_bypass_rls() OR organization_id = app.current_org_id());
