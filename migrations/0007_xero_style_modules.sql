-- Xero-style Phase 2/3 operational modules. Domain records are tenant scoped.
CREATE TABLE IF NOT EXISTS quotes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 contact_id UUID REFERENCES contacts(id), quote_number TEXT NOT NULL, issue_date DATE NOT NULL, expiry_date DATE,
 status TEXT NOT NULL DEFAULT 'DRAFT', currency TEXT NOT NULL DEFAULT 'AUD', subtotal NUMERIC(20,8) NOT NULL DEFAULT 0,
 tax_total NUMERIC(20,8) NOT NULL DEFAULT 0, total NUMERIC(20,8) NOT NULL DEFAULT 0, notes TEXT, data JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(organization_id, quote_number));
CREATE TABLE IF NOT EXISTS credit_notes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 contact_id UUID REFERENCES contacts(id), credit_note_number TEXT NOT NULL, issue_date DATE NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT',
 currency TEXT NOT NULL DEFAULT 'AUD', subtotal NUMERIC(20,8) NOT NULL DEFAULT 0, tax_total NUMERIC(20,8) NOT NULL DEFAULT 0,
 total NUMERIC(20,8) NOT NULL DEFAULT 0, data JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(organization_id, credit_note_number));
CREATE TABLE IF NOT EXISTS purchase_orders (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 contact_id UUID REFERENCES contacts(id), po_number TEXT NOT NULL, order_date DATE NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT',
 currency TEXT NOT NULL DEFAULT 'AUD', total NUMERIC(20,8) NOT NULL DEFAULT 0, data JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(organization_id, po_number));
CREATE TABLE IF NOT EXISTS customer_payments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 contact_id UUID REFERENCES contacts(id), invoice_id UUID REFERENCES invoices(id), payment_date DATE NOT NULL, amount NUMERIC(20,8) NOT NULL,
 currency TEXT NOT NULL DEFAULT 'AUD', reference TEXT, bank_account_id UUID, status TEXT NOT NULL DEFAULT 'POSTED', data JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS supplier_payments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 contact_id UUID REFERENCES contacts(id), bill_id UUID REFERENCES bills(id), payment_date DATE NOT NULL, amount NUMERIC(20,8) NOT NULL,
 currency TEXT NOT NULL DEFAULT 'AUD', reference TEXT, bank_account_id UUID, status TEXT NOT NULL DEFAULT 'POSTED', data JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS bank_rules (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 name TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 100, conditions JSONB NOT NULL DEFAULT '[]'::jsonb, action JSONB NOT NULL DEFAULT '{}'::jsonb,
 is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS opening_balances (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 account_id UUID NOT NULL REFERENCES accounts(id), effective_date DATE NOT NULL, debit NUMERIC(20,8) NOT NULL DEFAULT 0,
 credit NUMERIC(20,8) NOT NULL DEFAULT 0, memo TEXT, status TEXT NOT NULL DEFAULT 'DRAFT', created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS accounting_periods (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 name TEXT NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN',
 locked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(organization_id,name));
CREATE TABLE IF NOT EXISTS expenses (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 employee_id UUID REFERENCES employees(id), vendor_name TEXT, expense_date DATE NOT NULL, amount NUMERIC(20,8) NOT NULL,
 tax_amount NUMERIC(20,8) NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'AUD', status TEXT NOT NULL DEFAULT 'DRAFT',
 description TEXT, data JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS expense_claims (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 employee_id UUID REFERENCES employees(id), claim_number TEXT NOT NULL, claim_date DATE NOT NULL, amount NUMERIC(20,8) NOT NULL,
 status TEXT NOT NULL DEFAULT 'DRAFT', data JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(organization_id,claim_number));
CREATE TABLE IF NOT EXISTS reimbursements (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 expense_claim_id UUID REFERENCES expense_claims(id), payment_date DATE, amount NUMERIC(20,8) NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING', reference TEXT, data JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS products (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 sku TEXT NOT NULL, name TEXT NOT NULL, description TEXT, unit_price NUMERIC(20,8) NOT NULL DEFAULT 0,
 purchase_price NUMERIC(20,8) NOT NULL DEFAULT 0, tax_rate NUMERIC(8,4) NOT NULL DEFAULT 0, quantity_on_hand NUMERIC(20,8) NOT NULL DEFAULT 0,
 is_active BOOLEAN NOT NULL DEFAULT TRUE, data JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(organization_id,sku));
CREATE TABLE IF NOT EXISTS stock_movements (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 product_id UUID NOT NULL REFERENCES products(id), movement_date TIMESTAMPTZ NOT NULL DEFAULT now(), quantity NUMERIC(20,8) NOT NULL,
 unit_cost NUMERIC(20,8) NOT NULL DEFAULT 0, movement_type TEXT NOT NULL, reference TEXT, data JSONB NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS fixed_assets (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 asset_code TEXT NOT NULL, name TEXT NOT NULL, acquisition_date DATE NOT NULL, cost NUMERIC(20,8) NOT NULL,
 residual_value NUMERIC(20,8) NOT NULL DEFAULT 0, useful_life_months INTEGER NOT NULL, accumulated_depreciation NUMERIC(20,8) NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'ACTIVE', data JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(organization_id,asset_code));
CREATE TABLE IF NOT EXISTS projects (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 code TEXT NOT NULL, name TEXT NOT NULL, contact_id UUID REFERENCES contacts(id), status TEXT NOT NULL DEFAULT 'ACTIVE',
 budget NUMERIC(20,8) NOT NULL DEFAULT 0, data JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(organization_id,code));
CREATE TABLE IF NOT EXISTS time_entries (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 project_id UUID REFERENCES projects(id), employee_id UUID REFERENCES employees(id), entry_date DATE NOT NULL, hours NUMERIC(12,4) NOT NULL,
 billable BOOLEAN NOT NULL DEFAULT TRUE, rate NUMERIC(20,8) NOT NULL DEFAULT 0, description TEXT, data JSONB NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS project_costs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 project_id UUID REFERENCES projects(id), cost_date DATE NOT NULL, amount NUMERIC(20,8) NOT NULL, description TEXT, data JSONB NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS project_budgets (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 project_id UUID REFERENCES projects(id), period_start DATE NOT NULL, period_end DATE NOT NULL, amount NUMERIC(20,8) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS files_documents (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 name TEXT NOT NULL, mime_type TEXT, storage_key TEXT, size_bytes BIGINT, entity_type TEXT, entity_id UUID, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS notifications (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 user_id UUID REFERENCES users(id), title TEXT NOT NULL, message TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'INFO', read_at TIMESTAMPTZ,
 data JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS budgets (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 name TEXT NOT NULL, fiscal_year INTEGER NOT NULL, data JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now());

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['quotes','credit_notes','purchase_orders','customer_payments','supplier_payments','bank_rules','opening_balances','accounting_periods','expenses','expense_claims','reimbursements','products','stock_movements','fixed_assets','projects','time_entries','project_costs','project_budgets','files_documents','notifications','budgets'] LOOP
   EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
   EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
   EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_isolation',t);
   EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (app.should_bypass_rls() OR organization_id = app.current_org_id()) WITH CHECK (app.should_bypass_rls() OR organization_id = app.current_org_id())', t||'_isolation',t);
 END LOOP; END $$;
