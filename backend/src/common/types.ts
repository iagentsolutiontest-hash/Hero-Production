export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  is_active: boolean;
}

export interface OrganizationRow {
  id: string;
  name: string;
  country_code: string;
  is_active: boolean;
}

export interface MembershipRow {
  id: string;
  user_id: string;
  organization_id: string;
  role_id: string;
  is_active: boolean;
  role_name?: string;
}

export interface AccountRow {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  type:
    | 'ASSET'
    | 'LIABILITY'
    | 'EQUITY'
    | 'REVENUE'
    | 'COST_OF_GOODS_SOLD'
    | 'EXPENSE';
  is_archived: boolean;
}

export interface JournalLineInput {
  accountCode: string;
  debit?: string; // decimal string, e.g. "100.00"
  credit?: string;
  memo?: string;
}

export interface PostJournalEntryInput {
  organizationId: string;
  entryDate: Date;
  description: string;
  sourceType: string;
  sourceId?: string;
  lines: JournalLineInput[];
}

export interface ContactRow {
  id: string;
  organization_id: string;
  type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
  name: string;
  email: string | null;
  currency: string;
}
