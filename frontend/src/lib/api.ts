const API_BASE = (import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:3000' : '')).replace(/\/$/, '');

if (!API_BASE) {
  throw new Error('VITE_API_BASE_URL is required in production.');
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  accessToken?: string | null;
  organizationId?: string | null;
  _retried?: boolean;
}

/** Called when a request gets 401 — should return a fresh access token or null. */
type TokenRefreshHandler = () => Promise<string | null>;
let tokenRefreshHandler: TokenRefreshHandler | null = null;

export function setTokenRefreshHandler(handler: TokenRefreshHandler) {
  tokenRefreshHandler = handler;
}

async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.accessToken) headers['Authorization'] = `Bearer ${options.accessToken}`;
  if (options.organizationId) headers['x-organization-id'] = options.organizationId;

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // Silent token refresh on expired access token
  if (res.status === 401 && !options._retried && tokenRefreshHandler && options.accessToken) {
    const newToken = await tokenRefreshHandler();
    if (newToken) {
      return apiFetch<T>(path, { ...options, accessToken: newToken, _retried: true });
    }
  }

  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.success) {
    const code = json?.error?.code || 'ERROR';
    const message = json?.error?.message || `Request failed with status ${res.status}`;
    throw new ApiError(res.status, code, message);
  }

  return json.data as T;
}

// ---- Types matching the backend's response shapes ----

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  userId?: string;
}

export interface OrgMembership {
  id: string;
  name: string;
  country_code: string;
  role_name: string;
}

export interface Contact {
  id: string;
  organization_id: string;
  type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
  name: string;
  email: string | null;
  currency: string;
}

export interface InvoiceSummary {
  id: string;
  invoice_number: string;
  status: string;
  subtotal: string;
  tax_total: string;
  total: string;
  balance_remaining: string;
}

export interface BillSummary {
  id: string;
  bill_number: string;
  status: string;
  subtotal: string;
  tax_total: string;
  total: string;
  balance_remaining: string;
}

export interface InvoiceLineInput {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRateCode: string;
}

export interface BankAccount {
  id: string;
  name: string;
  currency: string;
  gl_account_code: string;
}

export interface BankTransaction {
  id: string;
  txn_date: string;
  description: string;
  amount: string;
  status: 'UNMATCHED' | 'MATCHED' | 'RECONCILED';
  matched_invoice_id: string | null;
  matched_bill_id: string | null;
}

export interface TrialBalanceRow {
  account_code: string;
  account_name: string;
  type: string;
  debit: string;
  credit: string;
}

export interface ProfitAndLoss {
  fromDate: string;
  toDate: string;
  lines: { code: string; name: string; type: string; amount: string }[];
  totals: {
    revenue: string;
    costOfGoodsSold: string;
    grossProfit: string;
    expenses: string;
    netProfit: string;
  };
}

export interface BalanceSheet {
  asOfDate: string;
  lines: { code: string; name: string; type: string; amount: string }[];
  totals: {
    assets: string;
    liabilities: string;
    explicitEquity: string;
    derivedEquityPlug: string;
    note: string;
  };
}

export interface ContactStatement {
  contact: Contact;
  invoices: { id: string; invoice_number: string; issue_date: string; status: string; total: string; paid: string; balance: string }[];
  bills: { id: string; bill_number: string; issue_date: string; status: string; total: string; paid: string; balance: string }[];
  totals: { totalReceivable: string; totalPayable: string };
}

// ---- API surface ----


export interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  parent_id: string | null;
  is_system: boolean;
  is_archived: boolean;
}

export interface JournalSummary {
  id: string;
  entry_date: string;
  description: string;
  source_type: string;
  status: string;
  total_debit: string;
}

export interface JournalDetail {
  id: string;
  entry_date: string;
  description: string;
  source_type: string;
  status: string;
  lines: { account_code: string; account_name: string; debit: string; credit: string; memo: string | null }[];
}

/** A row from any generic "operations" table — shape varies by entity, so callers narrow as needed. */
export type OpsRecord = Record<string, any>;

export const api = {
  auth: {
    register: (email: string, password: string, fullName: string) =>
      apiFetch<{ id: string; email: string; full_name: string }>('/api/v1/auth/register', {
        method: 'POST',
        body: { email, password, fullName },
      }),
    login: (email: string, password: string) =>
      apiFetch<AuthTokens>('/api/v1/auth/login', { method: 'POST', body: { email, password } }),
    refresh: (refreshToken: string) =>
      apiFetch<AuthTokens>('/api/v1/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
      }),
    logout: (refreshToken: string) =>
      apiFetch<void>('/api/v1/auth/logout', {
        method: 'POST',
        body: { refreshToken },
      }),
  },
  organizations: {
    create: (accessToken: string, name: string, countryCode = 'AU') =>
      apiFetch<{ organizationId: string }>('/api/v1/organizations', {
        method: 'POST',
        accessToken,
        body: { name, countryCode },
      }),
    mine: (accessToken: string) =>
      apiFetch<OrgMembership[]>('/api/v1/organizations/mine', { accessToken }),
  },
  contacts: {
    list: (accessToken: string, organizationId: string) =>
      apiFetch<Contact[]>('/api/v1/contacts', { accessToken, organizationId }),
    create: (
      accessToken: string,
      organizationId: string,
      input: { type: string; name: string; email?: string },
    ) =>
      apiFetch<Contact>('/api/v1/contacts', {
        method: 'POST',
        accessToken,
        organizationId,
        body: input,
      }),
    statement: (accessToken: string, organizationId: string, contactId: string) =>
      apiFetch<ContactStatement>(`/api/v1/contacts/${contactId}/statement`, {
        accessToken,
        organizationId,
      }),
    remove: (accessToken: string, organizationId: string, contactId: string) =>
      apiFetch<{ contactId: string; deleted: boolean }>(`/api/v1/contacts/${contactId}`, {
        method: 'DELETE',
        accessToken,
        organizationId,
      }),
    bulkDelete: (accessToken: string, organizationId: string, ids: string[]) =>
      apiFetch<{ deleted: string[]; skipped: { id: string; reason: string }[] }>(
        '/api/v1/contacts/bulk-delete',
        { method: 'POST', accessToken, organizationId, body: { ids } },
      ),
  },
  invoices: {
    list: (accessToken: string, organizationId: string) =>
      apiFetch<InvoiceSummary[]>('/api/v1/invoices', { accessToken, organizationId }),
    create: (
      accessToken: string,
      organizationId: string,
      input: {
        contactId: string;
        issueDate: string;
        dueDate: string;
        currency?: string;
        lines: InvoiceLineInput[];
        notes?: string;
      },
    ) =>
      apiFetch<InvoiceSummary>('/api/v1/invoices', {
        method: 'POST',
        accessToken,
        organizationId,
        body: input,
      }),
    send: (accessToken: string, organizationId: string, invoiceId: string) =>
      apiFetch<{ invoiceId: string; journalEntryId: string; status: string }>(
        `/api/v1/invoices/${invoiceId}/send`,
        { method: 'POST', accessToken, organizationId },
      ),
    void: (accessToken: string, organizationId: string, invoiceId: string, reason?: string) =>
      apiFetch<{ invoiceId: string; status: string }>(
        `/api/v1/invoices/${invoiceId}/void`,
        { method: 'POST', accessToken, organizationId, body: { reason } },
      ),
    creditNote: (accessToken: string, organizationId: string, invoiceId: string, reason?: string) =>
      apiFetch<{ invoiceId: string; status: string; creditedAmount: string }>(
        `/api/v1/invoices/${invoiceId}/credit-note`,
        { method: 'POST', accessToken, organizationId, body: { reason } },
      ),
    remove: (accessToken: string, organizationId: string, invoiceId: string) =>
      apiFetch<{ invoiceId: string; deleted: boolean }>(`/api/v1/invoices/${invoiceId}`, {
        method: 'DELETE',
        accessToken,
        organizationId,
      }),
    bulkDelete: (accessToken: string, organizationId: string, ids: string[]) =>
      apiFetch<{ deleted: string[]; skipped: { id: string; reason: string }[] }>(
        '/api/v1/invoices/bulk-delete',
        { method: 'POST', accessToken, organizationId, body: { ids } },
      ),
    bulkVoid: (accessToken: string, organizationId: string, ids: string[]) =>
      apiFetch<{ voided: string[]; skipped: { id: string; reason: string }[] }>(
        '/api/v1/invoices/bulk-void',
        { method: 'POST', accessToken, organizationId, body: { ids } },
      ),
    duplicate: (accessToken: string, organizationId: string, invoiceId: string) =>
      apiFetch<InvoiceSummary>(`/api/v1/invoices/${invoiceId}/duplicate`, {
        method: 'POST',
        accessToken,
        organizationId,
      }),
  },
  bills: {
    list: (accessToken: string, organizationId: string) =>
      apiFetch<BillSummary[]>('/api/v1/bills', { accessToken, organizationId }),
    create: (
      accessToken: string,
      organizationId: string,
      input: {
        contactId: string;
        issueDate: string;
        dueDate: string;
        currency?: string;
        lines: InvoiceLineInput[];
      },
    ) =>
      apiFetch<BillSummary>('/api/v1/bills', {
        method: 'POST',
        accessToken,
        organizationId,
        body: input,
      }),
    submit: (accessToken: string, organizationId: string, billId: string) =>
      apiFetch<{ billId: string; status: string }>(`/api/v1/bills/${billId}/submit`, {
        method: 'POST',
        accessToken,
        organizationId,
      }),
    approve: (accessToken: string, organizationId: string, billId: string) =>
      apiFetch<{ billId: string; journalEntryId: string; status: string }>(
        `/api/v1/bills/${billId}/approve`,
        { method: 'POST', accessToken, organizationId },
      ),
    pay: (accessToken: string, organizationId: string, billId: string) =>
      apiFetch<{ billId: string; journalEntryId: string; status: string }>(
        `/api/v1/bills/${billId}/pay`,
        { method: 'POST', accessToken, organizationId },
      ),
    remove: (accessToken: string, organizationId: string, billId: string) =>
      apiFetch<{ billId: string; deleted: boolean }>(`/api/v1/bills/${billId}`, {
        method: 'DELETE',
        accessToken,
        organizationId,
      }),
    bulkDelete: (accessToken: string, organizationId: string, ids: string[]) =>
      apiFetch<{ deleted: string[]; skipped: { id: string; reason: string }[] }>(
        '/api/v1/bills/bulk-delete',
        { method: 'POST', accessToken, organizationId, body: { ids } },
      ),
  },
  bankAccounts: {
    list: (accessToken: string, organizationId: string) =>
      apiFetch<BankAccount[]>('/api/v1/bank-accounts', { accessToken, organizationId }),
    create: (accessToken: string, organizationId: string, name: string, currency = 'AUD') =>
      apiFetch<BankAccount>('/api/v1/bank-accounts', {
        method: 'POST',
        accessToken,
        organizationId,
        body: { name, currency },
      }),
    importTransactions: (
      accessToken: string,
      organizationId: string,
      bankAccountId: string,
      transactions: { date: string; description: string; amount: string }[],
    ) =>
      apiFetch<{ imported: number; ids: string[] }>(
        `/api/v1/bank-accounts/${bankAccountId}/transactions/import`,
        { method: 'POST', accessToken, organizationId, body: { transactions } },
      ),
    importFile: (
      accessToken: string,
      organizationId: string,
      bankAccountId: string,
      content: string,
      format: 'csv' | 'ofx',
    ) =>
      apiFetch<{ imported: number; ids: string[]; parseErrors: string[]; parseErrorCount: number }>(
        `/api/v1/bank-accounts/${bankAccountId}/transactions/import-file`,
        { method: 'POST', accessToken, organizationId, body: { content, format } },
      ),
  },
  bankTransactions: {
    list: (accessToken: string, organizationId: string, bankAccountId?: string) =>
      apiFetch<BankTransaction[]>(
        `/api/v1/bank-transactions${bankAccountId ? `?bankAccountId=${bankAccountId}` : ''}`,
        { accessToken, organizationId },
      ),
    matchInvoice: (accessToken: string, organizationId: string, txnId: string, invoiceId: string) =>
      apiFetch<{ transactionId: string; journalEntryId: string; status: string }>(
        `/api/v1/bank-transactions/${txnId}/match-invoice`,
        { method: 'POST', accessToken, organizationId, body: { invoiceId } },
      ),
    matchBill: (accessToken: string, organizationId: string, txnId: string, billId: string) =>
      apiFetch<{ transactionId: string; journalEntryId: string; status: string }>(
        `/api/v1/bank-transactions/${txnId}/match-bill`,
        { method: 'POST', accessToken, organizationId, body: { billId } },
      ),
    categorize: (accessToken: string, organizationId: string, txnId: string, accountCode: string) =>
      apiFetch<{ transactionId: string; journalEntryId: string; status: string }>(
        `/api/v1/bank-transactions/${txnId}/categorize`,
        { method: 'POST', accessToken, organizationId, body: { accountCode } },
      ),
    reconcile: (accessToken: string, organizationId: string, txnId: string) =>
      apiFetch<{ transactionId: string; status: string }>(
        `/api/v1/bank-transactions/${txnId}/reconcile`,
        { method: 'POST', accessToken, organizationId },
      ),
    unmatch: (accessToken: string, organizationId: string, txnId: string) =>
      apiFetch<{ transactionId: string; status: string }>(
        `/api/v1/bank-transactions/${txnId}/unmatch`,
        { method: 'POST', accessToken, organizationId },
      ),
  },
  reports: {
    trialBalance: (accessToken: string, organizationId: string) =>
      apiFetch<TrialBalanceRow[]>('/api/v1/reports/trial-balance', { accessToken, organizationId }),
    profitAndLoss: (accessToken: string, organizationId: string, from: string, to: string) =>
      apiFetch<ProfitAndLoss>(`/api/v1/reports/profit-and-loss?from=${from}&to=${to}`, {
        accessToken,
        organizationId,
      }),
    balanceSheet: (accessToken: string, organizationId: string, asOf: string) =>
      apiFetch<BalanceSheet>(`/api/v1/reports/balance-sheet?asOf=${asOf}`, {
        accessToken,
        organizationId,
      }),
    gstSummary: (accessToken: string, organizationId: string, from: string, to: string) =>
      apiFetch<{
        fromDate: string;
        toDate: string;
        gstCollectedOnSales: string;
        gstCreditsOnPurchases: string;
        netGstPayable: string;
        disclaimer: string;
      }>(`/api/v1/reports/gst-summary?from=${from}&to=${to}`, { accessToken, organizationId }),
  },


  members: {
    list: (accessToken: string, organizationId: string) =>
      apiFetch<{ membership_id: string; user_id: string; email: string; full_name: string; role_name: string; is_active: boolean }[]>(
        '/api/v1/members',
        { accessToken, organizationId },
      ),
    roles: (accessToken: string, organizationId: string) =>
      apiFetch<{ id: string; name: string }[]>('/api/v1/members/roles', { accessToken, organizationId }),
    invite: (
      accessToken: string,
      organizationId: string,
      input: { email: string; roleName: string; fullName?: string },
    ) =>
      apiFetch<{ userId: string; email: string; roleName: string; tempPassword: string | null; note: string }>(
        '/api/v1/members/invite',
        { method: 'POST', accessToken, organizationId, body: input },
      ),
    updateRole: (accessToken: string, organizationId: string, membershipId: string, roleName: string) =>
      apiFetch<{ membershipId: string; roleName: string }>(
        `/api/v1/members/${membershipId}/role`,
        { method: 'PATCH', accessToken, organizationId, body: { roleName } },
      ),
    deactivate: (accessToken: string, organizationId: string, membershipId: string) =>
      apiFetch<{ membershipId: string; is_active: boolean }>(
        `/api/v1/members/${membershipId}/deactivate`,
        { method: 'POST', accessToken, organizationId },
      ),
  },

  countries: {
    list: () =>
      apiFetch<
        {
          countryCode: string;
          name: string;
          registrationIdLabel: string;
          defaultCurrency: string;
          taxRates: { code: string; label: string; rate: string }[];
        }[]
      >('/api/v1/countries'),
    taxRates: (accessToken: string, organizationId: string) =>
      apiFetch<{
        countryCode: string;
        registrationIdLabel: string;
        defaultCurrency: string;
        taxRates: { code: string; label: string; rate: string }[];
      }>('/api/v1/countries/tax-rates', { accessToken, organizationId }),
  },

  payments: {
    stripeStatus: (accessToken: string) =>
      apiFetch<{ configured: boolean }>('/api/v1/payments/stripe/status', { accessToken }),
    stripeCheckout: (
      accessToken: string,
      organizationId: string,
      input: { invoiceId: string; successUrl: string; cancelUrl: string },
    ) =>
      apiFetch<{ sessionId: string; url: string; amount: string; currency: string }>(
        '/api/v1/payments/stripe/checkout',
        { method: 'POST', accessToken, organizationId, body: input },
      ),
  },
  ledger: {
    listAccounts: (accessToken: string, organizationId: string) =>
      apiFetch<Account[]>('/api/v1/ledger/accounts', { accessToken, organizationId }),
    createAccount: (
      accessToken: string,
      organizationId: string,
      input: { code: string; name: string; type: string; parentId?: string },
    ) =>
      apiFetch<Account>('/api/v1/ledger/accounts', {
        method: 'POST',
        accessToken,
        organizationId,
        body: input,
      }),
    listJournals: (accessToken: string, organizationId: string) =>
      apiFetch<JournalSummary[]>('/api/v1/ledger/journals', { accessToken, organizationId }),
    getJournal: (accessToken: string, organizationId: string, id: string) =>
      apiFetch<JournalDetail>(`/api/v1/ledger/journals/${id}`, { accessToken, organizationId }),
    postJournal: (
      accessToken: string,
      organizationId: string,
      input: {
        entryDate: string;
        description: string;
        lines: { accountCode: string; debit?: string; credit?: string; memo?: string }[];
      },
    ) =>
      apiFetch<{ journalEntryId: string }>('/api/v1/ledger/journals', {
        method: 'POST',
        accessToken,
        organizationId,
        body: input,
      }),
  },

  // Generic CRUD over the "operations" modules (quotes, expenses, inventory,
  // projects, etc — see backend src/modules/operations/operations.registry.ts).
  // `entity` is the URL segment, e.g. 'quotes', 'credit-notes', 'products'.
  ops: {
    list: (accessToken: string, organizationId: string, entity: string, filters?: Record<string, string>) => {
      const qs = filters && Object.keys(filters).length ? `?${new URLSearchParams(filters).toString()}` : '';
      return apiFetch<OpsRecord[]>(`/api/v1/ops/${entity}${qs}`, { accessToken, organizationId });
    },
    getOne: (accessToken: string, organizationId: string, entity: string, id: string) =>
      apiFetch<OpsRecord>(`/api/v1/ops/${entity}/${id}`, { accessToken, organizationId }),
    create: (accessToken: string, organizationId: string, entity: string, body: Record<string, unknown>) =>
      apiFetch<OpsRecord>(`/api/v1/ops/${entity}`, { method: 'POST', accessToken, organizationId, body }),
    update: (accessToken: string, organizationId: string, entity: string, id: string, body: Record<string, unknown>) =>
      apiFetch<OpsRecord>(`/api/v1/ops/${entity}/${id}`, { method: 'PATCH', accessToken, organizationId, body }),
    remove: (accessToken: string, organizationId: string, entity: string, id: string) =>
      apiFetch<{ id: string; deleted: boolean }>(`/api/v1/ops/${entity}/${id}`, {
        method: 'DELETE',
        accessToken,
        organizationId,
      }),
    bulkDelete: (accessToken: string, organizationId: string, entity: string, ids: string[]) =>
      apiFetch<{ deleted: string[]; skipped: { id: string; reason: string }[] }>(
        `/api/v1/ops/${entity}/bulk-delete`,
        { method: 'POST', accessToken, organizationId, body: { ids } },
      ),
    runDepreciation: (accessToken: string, organizationId: string, assetId: string) =>
      apiFetch<{ asset: OpsRecord; amountPosted: string; message?: string }>(
        `/api/v1/ops/fixed-assets/${assetId}/run-depreciation`,
        { method: 'POST', accessToken, organizationId },
      ),
    disposeAsset: (
      accessToken: string,
      organizationId: string,
      assetId: string,
      input: { disposalDate: string; proceeds?: string; reason?: string },
    ) =>
      apiFetch<OpsRecord>(`/api/v1/ops/fixed-assets/${assetId}/dispose`, {
        method: 'POST',
        accessToken,
        organizationId,
        body: input,
      }),
    generateInvoiceNow: (accessToken: string, organizationId: string, templateId: string) =>
      apiFetch<{ invoice: OpsRecord; templateId: string }>(
        `/api/v1/ops/recurring-invoices/${templateId}/generate`,
        { method: 'POST', accessToken, organizationId },
      ),
    generateBillNow: (accessToken: string, organizationId: string, templateId: string) =>
      apiFetch<{ bill: OpsRecord; templateId: string }>(
        `/api/v1/ops/recurring-bills/${templateId}/generate`,
        { method: 'POST', accessToken, organizationId },
      ),
    inventoryValuation: (accessToken: string, organizationId: string) =>
      apiFetch<{ rows: OpsRecord[]; totalValue: string }>('/api/v1/ops/reports/inventory-valuation', {
        accessToken,
        organizationId,
      }),
    cashFlow: (accessToken: string, organizationId: string, months = 6) =>
      apiFetch<{ inflows: { month: string; expected: string }[]; outflows: { month: string; expected: string }[] }>(
        `/api/v1/ops/reports/cash-flow?months=${months}`,
        { accessToken, organizationId },
      ),
    budgetVsActual: (accessToken: string, organizationId: string) =>
      apiFetch<{ project_id: string; code: string; name: string; budgeted: string; actual: string; variance: string }[]>(
        '/api/v1/ops/reports/budget-vs-actual',
        { accessToken, organizationId },
      ),
    analytics: (accessToken: string, organizationId: string) =>
      apiFetch<{
        contactCount: number;
        invoicesByStatus: { status: string; n: string; total: string }[];
        billsByStatus: { status: string; n: string; total: string }[];
        accountsReceivable: string;
        accountsPayable: string;
      }>('/api/v1/ops/reports/analytics', { accessToken, organizationId }),
  },

  payroll: {
    employees: (accessToken: string, organizationId: string) =>
      apiFetch<{ id: string; full_name: string; email: string | null }[]>('/api/v1/payroll/employees', {
        accessToken,
        organizationId,
      }),
  },

  ai: {
    ask: (accessToken: string, organizationId: string, prompt: string, summary?: string) =>
      apiFetch<{ reply: string; model: string }>('/api/v1/ai/ask', {
        method: 'POST',
        accessToken,
        organizationId,
        body: { prompt, summary },
      }),
  },
};
