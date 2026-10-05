-- Closes a real gap: "Opening Balances" and "Expenses" existed as plain
-- data-entry tables with no path to the ledger at all. This adds what's
-- needed for both to post real, balanced journal entries.

ALTER TABLE opening_balances ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id);
ALTER TABLE opening_balances ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_account_id UUID REFERENCES accounts(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_from_bank_account_id UUID REFERENCES bank_accounts(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id);
