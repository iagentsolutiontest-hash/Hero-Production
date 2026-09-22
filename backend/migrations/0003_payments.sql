-- Phase 5: partial payments.
-- A single invoice/bill can now be paid off across multiple bank
-- transactions. "Payments" is the ledger of applied amounts; an
-- invoice/bill's remaining balance = total - SUM(payments.amount).

CREATE TABLE payments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id         UUID REFERENCES invoices(id),
  bill_id            UUID REFERENCES bills(id),
  amount             NUMERIC(20,8) NOT NULL,
  payment_date       TIMESTAMPTZ NOT NULL,
  bank_transaction_id UUID REFERENCES bank_transactions(id),
  journal_entry_id   UUID REFERENCES journal_entries(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_has_one_target CHECK (
    (invoice_id IS NOT NULL AND bill_id IS NULL) OR
    (invoice_id IS NULL AND bill_id IS NOT NULL)
  )
);
CREATE INDEX idx_payments_org ON payments(organization_id);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_bill ON payments(bill_id);
