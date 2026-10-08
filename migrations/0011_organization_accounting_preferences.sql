-- Organization accounting preferences: currency and user-defined tax rates.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS base_currency TEXT NOT NULL DEFAULT 'AUD',
  ADD COLUMN IF NOT EXISTS tax_standard_rate NUMERIC(8,6),
  ADD COLUMN IF NOT EXISTS tax_free_rate NUMERIC(8,6),
  ADD COLUMN IF NOT EXISTS tax_input_rate NUMERIC(8,6);

CREATE INDEX IF NOT EXISTS idx_organizations_country ON organizations(country_code);

-- Backfill currency from country defaults for existing organizations.
UPDATE organizations o
SET base_currency = CASE o.country_code
  WHEN 'AU' THEN 'AUD'
  WHEN 'GB' THEN 'GBP'
  WHEN 'US' THEN 'USD'
  WHEN 'CA' THEN 'CAD'
  WHEN 'IN' THEN 'INR'
  WHEN 'NZ' THEN 'NZD'
  WHEN 'PK' THEN 'PKR'
  ELSE 'AUD'
END
;
