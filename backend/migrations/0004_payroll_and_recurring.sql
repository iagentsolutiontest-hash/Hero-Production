-- Payroll scaffold + recurring invoices (Phase extension)
-- WARNING: Payroll tax figures here are placeholders. Do not use for
-- real employee payments without verified statutory rules for your jurisdiction.

CREATE TABLE employees (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name        TEXT NOT NULL,
  email            TEXT,
  start_date       DATE,
  annual_salary    NUMERIC(20,2),
  pay_frequency    TEXT NOT NULL DEFAULT 'MONTHLY', -- WEEKLY | FORTNIGHTLY | MONTHLY
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_employees_org ON employees(organization_id);

CREATE TABLE payslips (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id      UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period_start     DATE NOT NULL,
  period_end       DATE NOT NULL,
  gross_pay        NUMERIC(20,2) NOT NULL,
  tax_withheld     NUMERIC(20,2) NOT NULL DEFAULT 0,
  net_pay          NUMERIC(20,2) NOT NULL,
  status           TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT | POSTED
  journal_entry_id UUID REFERENCES journal_entries(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payslips_org ON payslips(organization_id);

CREATE TABLE recurring_invoices (
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
CREATE INDEX idx_recurring_inv_org ON recurring_invoices(organization_id);
