import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { api, ApiError } from '../lib/api';
import type { OpsRecord } from '../lib/api';

// ---- Field / entity configuration -----------------------------------

type RefKey = 'contacts' | 'employees' | 'products' | 'projects' | 'accounts' | 'bankAccounts' | 'invoices' | 'bills' | 'expenseClaims';

type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox' | 'ref' | 'lines';

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  ref?: RefKey;
  placeholder?: string;
}

interface EntityConfig {
  backendEntity: string;
  title: string;
  subtitle: string;
  action: string;
  fields: FieldDef[];
  tableFieldKeys: string[];
  statusField?: string; // 'status' or 'is_active'
  statusOptions?: string[]; // for the filter dropdown + form select
  fixedFilters?: Record<string, string>;
  fixedCreateValues?: Record<string, unknown>;
  rowAction?: 'generate-invoice' | 'generate-bill';
}

const REF_LABELS: Record<RefKey, string> = {
  contacts: 'Contact',
  employees: 'Employee',
  products: 'Product',
  projects: 'Project',
  accounts: 'Account',
  bankAccounts: 'Bank account',
  invoices: 'Invoice',
  bills: 'Bill',
  expenseClaims: 'Expense claim',
};

const CONFIGS: Record<string, EntityConfig> = {
  '/quotes': {
    backendEntity: 'quotes', title: 'Quotes', subtitle: 'Create, send and track customer quotes.', action: 'New quote',
    statusField: 'status', statusOptions: ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED'],
    fields: [
      { key: 'contact_id', label: 'Customer', type: 'ref', ref: 'contacts', required: true },
      { key: 'quote_number', label: 'Quote #', type: 'text', required: true },
      { key: 'issue_date', label: 'Issue date', type: 'date', required: true },
      { key: 'expiry_date', label: 'Expiry date', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED'] },
      { key: 'total', label: 'Total', type: 'text', placeholder: '0.00' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    tableFieldKeys: ['quote_number', 'contact_id', 'issue_date', 'total'],
  },
  '/credit-notes': {
    backendEntity: 'credit-notes', title: 'Credit notes', subtitle: 'Manage credits and adjustments against sales.', action: 'New credit note',
    statusField: 'status', statusOptions: ['DRAFT', 'APPROVED', 'VOIDED'],
    fields: [
      { key: 'contact_id', label: 'Customer', type: 'ref', ref: 'contacts', required: true },
      { key: 'credit_note_number', label: 'Credit note #', type: 'text', required: true },
      { key: 'issue_date', label: 'Issue date', type: 'date', required: true },
      { key: 'status', label: 'Status', type: 'select', options: ['DRAFT', 'APPROVED', 'VOIDED'] },
      { key: 'total', label: 'Total', type: 'text', placeholder: '0.00' },
    ],
    tableFieldKeys: ['credit_note_number', 'contact_id', 'issue_date', 'total'],
  },
  '/purchase-orders': {
    backendEntity: 'purchase-orders', title: 'Purchase orders', subtitle: 'Create and track supplier purchase orders.', action: 'New purchase order',
    statusField: 'status', statusOptions: ['DRAFT', 'SENT', 'RECEIVED', 'CANCELLED'],
    fields: [
      { key: 'contact_id', label: 'Supplier', type: 'ref', ref: 'contacts', required: true },
      { key: 'po_number', label: 'PO #', type: 'text', required: true },
      { key: 'order_date', label: 'Order date', type: 'date', required: true },
      { key: 'status', label: 'Status', type: 'select', options: ['DRAFT', 'SENT', 'RECEIVED', 'CANCELLED'] },
      { key: 'total', label: 'Total', type: 'text', placeholder: '0.00' },
    ],
    tableFieldKeys: ['po_number', 'contact_id', 'order_date', 'total'],
  },
  '/customer-payments': {
    backendEntity: 'customer-payments', title: 'Customer payments', subtitle: 'Track money received from customers.', action: 'Record payment',
    statusField: 'status', statusOptions: ['POSTED', 'VOID'],
    fields: [
      { key: 'contact_id', label: 'Customer', type: 'ref', ref: 'contacts' },
      { key: 'invoice_id', label: 'Invoice', type: 'ref', ref: 'invoices' },
      { key: 'payment_date', label: 'Payment date', type: 'date', required: true },
      { key: 'amount', label: 'Amount', type: 'text', required: true, placeholder: '0.00' },
      { key: 'reference', label: 'Reference', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['POSTED', 'VOID'] },
    ],
    tableFieldKeys: ['reference', 'contact_id', 'payment_date', 'amount'],
  },
  '/supplier-payments': {
    backendEntity: 'supplier-payments', title: 'Supplier payments', subtitle: 'Track outgoing payments to suppliers.', action: 'Record payment',
    statusField: 'status', statusOptions: ['POSTED', 'VOID'],
    fields: [
      { key: 'contact_id', label: 'Supplier', type: 'ref', ref: 'contacts' },
      { key: 'bill_id', label: 'Bill', type: 'ref', ref: 'bills' },
      { key: 'payment_date', label: 'Payment date', type: 'date', required: true },
      { key: 'amount', label: 'Amount', type: 'text', required: true, placeholder: '0.00' },
      { key: 'reference', label: 'Reference', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['POSTED', 'VOID'] },
    ],
    tableFieldKeys: ['reference', 'contact_id', 'payment_date', 'amount'],
  },
  '/bank-rules': {
    backendEntity: 'bank-rules', title: 'Bank rules', subtitle: 'Automatically categorize recurring bank transactions.', action: 'New bank rule',
    statusField: 'is_active',
    fields: [
      { key: 'name', label: 'Rule name', type: 'text', required: true },
      { key: 'priority', label: 'Priority', type: 'number', placeholder: '100' },
      { key: 'is_active', label: 'Active', type: 'checkbox' },
    ],
    tableFieldKeys: ['name', 'priority'],
  },
  '/opening-balances': {
    backendEntity: 'opening-balances', title: 'Opening balances', subtitle: 'Set opening balances when moving an organization into Hero.', action: 'Add opening balance',
    statusField: 'status', statusOptions: ['DRAFT', 'POSTED'],
    fields: [
      { key: 'account_id', label: 'Account', type: 'ref', ref: 'accounts', required: true },
      { key: 'effective_date', label: 'Effective date', type: 'date', required: true },
      { key: 'debit', label: 'Debit', type: 'text', placeholder: '0.00' },
      { key: 'credit', label: 'Credit', type: 'text', placeholder: '0.00' },
      { key: 'memo', label: 'Memo', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['DRAFT', 'POSTED'] },
    ],
    tableFieldKeys: ['account_id', 'effective_date', 'debit', 'credit'],
  },
  '/accounting-periods': {
    backendEntity: 'accounting-periods', title: 'Accounting periods', subtitle: 'Control financial periods and closing dates.', action: 'New period',
    statusField: 'status', statusOptions: ['OPEN', 'CLOSED', 'LOCKED'],
    fields: [
      { key: 'name', label: 'Period name', type: 'text', required: true },
      { key: 'start_date', label: 'Start date', type: 'date', required: true },
      { key: 'end_date', label: 'End date', type: 'date', required: true },
      { key: 'status', label: 'Status', type: 'select', options: ['OPEN', 'CLOSED', 'LOCKED'] },
    ],
    tableFieldKeys: ['name', 'start_date', 'end_date'],
  },
  '/expenses': {
    backendEntity: 'expenses', title: 'Expenses', subtitle: 'Capture and manage business expenses.', action: 'New expense',
    statusField: 'status', statusOptions: ['DRAFT', 'SUBMITTED', 'APPROVED', 'PAID'],
    fields: [
      { key: 'employee_id', label: 'Employee', type: 'ref', ref: 'employees' },
      { key: 'vendor_name', label: 'Vendor', type: 'text' },
      { key: 'expense_date', label: 'Expense date', type: 'date', required: true },
      { key: 'amount', label: 'Amount', type: 'text', required: true, placeholder: '0.00' },
      { key: 'status', label: 'Status', type: 'select', options: ['DRAFT', 'SUBMITTED', 'APPROVED', 'PAID'] },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
    tableFieldKeys: ['vendor_name', 'employee_id', 'expense_date', 'amount'],
  },
  '/expense-claims': {
    backendEntity: 'expense-claims', title: 'Expense claims', subtitle: 'Submit and approve employee expense claims.', action: 'New claim',
    statusField: 'status', statusOptions: ['DRAFT', 'SUBMITTED', 'APPROVED', 'PAID'],
    fields: [
      { key: 'employee_id', label: 'Employee', type: 'ref', ref: 'employees' },
      { key: 'claim_number', label: 'Claim #', type: 'text', required: true },
      { key: 'claim_date', label: 'Claim date', type: 'date', required: true },
      { key: 'amount', label: 'Amount', type: 'text', required: true, placeholder: '0.00' },
      { key: 'status', label: 'Status', type: 'select', options: ['DRAFT', 'SUBMITTED', 'APPROVED', 'PAID'] },
    ],
    tableFieldKeys: ['claim_number', 'employee_id', 'claim_date', 'amount'],
  },
  '/reimbursements': {
    backendEntity: 'reimbursements', title: 'Reimbursements', subtitle: 'Manage approved employee reimbursements.', action: 'New reimbursement',
    statusField: 'status', statusOptions: ['PENDING', 'PAID'],
    fields: [
      { key: 'expense_claim_id', label: 'Expense claim', type: 'ref', ref: 'expenseClaims' },
      { key: 'payment_date', label: 'Payment date', type: 'date' },
      { key: 'amount', label: 'Amount', type: 'text', required: true, placeholder: '0.00' },
      { key: 'reference', label: 'Reference', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['PENDING', 'PAID'] },
    ],
    tableFieldKeys: ['reference', 'expense_claim_id', 'payment_date', 'amount'],
  },
  '/products': {
    backendEntity: 'products', title: 'Products & services', subtitle: 'Manage products, services, prices and tax codes.', action: 'New product',
    statusField: 'is_active',
    fields: [
      { key: 'sku', label: 'SKU', type: 'text', required: true },
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'unit_price', label: 'Sale price', type: 'text', placeholder: '0.00' },
      { key: 'purchase_price', label: 'Cost price', type: 'text', placeholder: '0.00' },
      { key: 'quantity_on_hand', label: 'Quantity on hand', type: 'text', placeholder: '0' },
      { key: 'is_active', label: 'Active', type: 'checkbox' },
    ],
    tableFieldKeys: ['sku', 'name', 'quantity_on_hand', 'unit_price'],
  },
  '/inventory': {
    backendEntity: 'products', title: 'Inventory', subtitle: 'Track products, quantities and stock value.', action: 'New item',
    statusField: 'is_active',
    fields: [
      { key: 'sku', label: 'SKU', type: 'text', required: true },
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'quantity_on_hand', label: 'Quantity on hand', type: 'text', placeholder: '0' },
      { key: 'purchase_price', label: 'Cost price', type: 'text', placeholder: '0.00' },
      { key: 'is_active', label: 'Active', type: 'checkbox' },
    ],
    tableFieldKeys: ['sku', 'name', 'quantity_on_hand', 'purchase_price'],
  },
  '/stock-adjustments': {
    backendEntity: 'stock-movements', title: 'Stock adjustments', subtitle: 'Correct inventory quantities and reasons.', action: 'New adjustment',
    fields: [
      { key: 'product_id', label: 'Product', type: 'ref', ref: 'products', required: true },
      { key: 'quantity', label: 'Quantity (+/-)', type: 'text', required: true, placeholder: 'e.g. 20 or -5' },
      { key: 'unit_cost', label: 'Unit cost', type: 'text', placeholder: '0.00' },
      { key: 'movement_type', label: 'Type', type: 'select', options: ['IN', 'OUT', 'ADJUSTMENT'], required: true },
      { key: 'reference', label: 'Reference', type: 'text' },
    ],
    tableFieldKeys: ['product_id', 'movement_type', 'quantity', 'reference'],
  },
  '/fixed-assets': {
    backendEntity: 'fixed-assets', title: 'Fixed assets', subtitle: 'Manage assets, depreciation and disposals.', action: 'New asset',
    statusField: 'status', statusOptions: ['ACTIVE', 'DISPOSED'],
    fields: [
      { key: 'asset_code', label: 'Asset code', type: 'text', required: true },
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'acquisition_date', label: 'Acquisition date', type: 'date', required: true },
      { key: 'cost', label: 'Cost', type: 'text', required: true, placeholder: '0.00' },
      { key: 'residual_value', label: 'Residual value', type: 'text', placeholder: '0.00' },
      { key: 'useful_life_months', label: 'Useful life (months)', type: 'number', required: true },
    ],
    tableFieldKeys: ['asset_code', 'name', 'acquisition_date', 'cost'],
  },
  '/projects': {
    backendEntity: 'projects', title: 'Projects', subtitle: 'Track project revenue, costs, time and profitability.', action: 'New project',
    statusField: 'status', statusOptions: ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'],
    fields: [
      { key: 'code', label: 'Code', type: 'text', required: true },
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'contact_id', label: 'Client', type: 'ref', ref: 'contacts' },
      { key: 'status', label: 'Status', type: 'select', options: ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] },
      { key: 'budget', label: 'Budget', type: 'text', placeholder: '0.00' },
    ],
    tableFieldKeys: ['code', 'name', 'contact_id', 'budget'],
  },
  '/time-tracking': {
    backendEntity: 'time-entries', title: 'Time tracking', subtitle: 'Record billable and non-billable project time.', action: 'Log time',
    fields: [
      { key: 'project_id', label: 'Project', type: 'ref', ref: 'projects' },
      { key: 'employee_id', label: 'Employee', type: 'ref', ref: 'employees' },
      { key: 'entry_date', label: 'Date', type: 'date', required: true },
      { key: 'hours', label: 'Hours', type: 'text', required: true, placeholder: '0.0' },
      { key: 'rate', label: 'Rate', type: 'text', placeholder: '0.00' },
      { key: 'billable', label: 'Billable', type: 'checkbox' },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
    tableFieldKeys: ['project_id', 'employee_id', 'entry_date', 'hours'],
  },
  '/project-costs': {
    backendEntity: 'project-costs', title: 'Project costs', subtitle: 'Allocate expenses and costs to projects.', action: 'Add project cost',
    fields: [
      { key: 'project_id', label: 'Project', type: 'ref', ref: 'projects' },
      { key: 'cost_date', label: 'Date', type: 'date', required: true },
      { key: 'amount', label: 'Amount', type: 'text', required: true, placeholder: '0.00' },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
    tableFieldKeys: ['project_id', 'cost_date', 'amount', 'description'],
  },
  '/project-budgets': {
    backendEntity: 'project-budgets', title: 'Project budgets', subtitle: 'Set budgets and monitor project performance.', action: 'New budget',
    fields: [
      { key: 'project_id', label: 'Project', type: 'ref', ref: 'projects' },
      { key: 'period_start', label: 'Period start', type: 'date', required: true },
      { key: 'period_end', label: 'Period end', type: 'date', required: true },
      { key: 'amount', label: 'Amount', type: 'text', required: true, placeholder: '0.00' },
    ],
    tableFieldKeys: ['project_id', 'period_start', 'period_end', 'amount'],
  },
  '/files': {
    backendEntity: 'files', title: 'Files & documents', subtitle: 'Keep invoices, bills, receipts and supporting documents together.', action: 'Upload file',
    fields: [
      { key: 'name', label: 'File name', type: 'text', required: true },
      { key: 'mime_type', label: 'Type', type: 'text', placeholder: 'application/pdf' },
      { key: 'entity_type', label: 'Category', type: 'text', placeholder: 'INVOICE, BILL, RECEIPT…' },
      { key: 'storage_key', label: 'Storage key / URL', type: 'text' },
    ],
    tableFieldKeys: ['name', 'mime_type', 'entity_type'],
  },
  '/receipts': {
    backendEntity: 'files', title: 'Receipts', subtitle: 'Store receipts and supporting documents.', action: 'Upload receipt',
    fixedFilters: { entity_type: 'RECEIPT' },
    fixedCreateValues: { entity_type: 'RECEIPT' },
    fields: [
      { key: 'name', label: 'File name', type: 'text', required: true },
      { key: 'mime_type', label: 'Type', type: 'text', placeholder: 'image/jpeg' },
      { key: 'storage_key', label: 'Storage key / URL', type: 'text' },
    ],
    tableFieldKeys: ['name', 'mime_type', 'storage_key'],
  },
  '/recurring-invoices': {
    backendEntity: 'recurring-invoices', title: 'Recurring invoices', subtitle: 'Automate invoices that repeat on a schedule.', action: 'New recurring invoice',
    statusField: 'is_active', rowAction: 'generate-invoice',
    fields: [
      { key: 'contact_id', label: 'Customer', type: 'ref', ref: 'contacts', required: true },
      { key: 'frequency', label: 'Frequency', type: 'select', options: ['WEEKLY', 'MONTHLY', 'QUARTERLY'] },
      { key: 'next_run_date', label: 'Next run date', type: 'date', required: true },
      { key: 'is_active', label: 'Active', type: 'checkbox' },
      { key: 'line_template', label: 'Line items', type: 'lines', required: true },
    ],
    tableFieldKeys: ['contact_id', 'frequency', 'next_run_date'],
  },
  '/recurring-bills': {
    backendEntity: 'recurring-bills', title: 'Recurring bills', subtitle: 'Schedule supplier bills and recurring costs.', action: 'New recurring bill',
    statusField: 'is_active', rowAction: 'generate-bill',
    fields: [
      { key: 'contact_id', label: 'Supplier', type: 'ref', ref: 'contacts', required: true },
      { key: 'frequency', label: 'Frequency', type: 'select', options: ['WEEKLY', 'MONTHLY', 'QUARTERLY'] },
      { key: 'next_run_date', label: 'Next run date', type: 'date', required: true },
      { key: 'is_active', label: 'Active', type: 'checkbox' },
      { key: 'line_template', label: 'Line items', type: 'lines', required: true },
    ],
    tableFieldKeys: ['contact_id', 'frequency', 'next_run_date'],
  },
};

const DEFAULT_LINE = () => ({ description: '', quantity: '1', unitPrice: '', taxRateCode: '' });

// ---- Helpers -----------------------------------------------------------

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return Array.isArray(value) ? `${value.length} item${value.length === 1 ? '' : 's'}` : '—';
  const str = String(value);
  // ISO date/datetime → just the date part for readability
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) return str.slice(0, 10);
  return str;
}

function toCsv(rows: OpsRecord[], keys: string[], resolveRef: (key: string, value: unknown) => string): string {
  const escape = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
  const lines = [keys.map(escape).join(',')];
  for (const r of rows) {
    lines.push(keys.map((k) => escape(resolveRef(k, r[k]))).join(','));
  }
  return lines.join('\n');
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---- Component -----------------------------------------------------------

export function ModulePage() {
  const location = useLocation();
  const { session, activeOrg } = useSession();
  const config = CONFIGS[location.pathname];

  const [rows, setRows] = useState<OpsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [refCache, setRefCache] = useState<Partial<Record<RefKey, { id: string; label: string }[] | 'error'>>>({});
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const token = session?.accessToken;
  const orgId = activeOrg?.id;

  function loadRows() {
    if (!token || !orgId || !config) return;
    setLoading(true);
    setLoadError(null);
    api.ops
      .list(token, orgId, config.backendEntity, config.fixedFilters)
      .then((data) => setRows(data))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Could not load records.'))
      .finally(() => setLoading(false));
  }

  // Reset + reload whenever the module route changes.
  useEffect(() => {
    setSearch('');
    setStatusFilter('All');
    setShowForm(false);
    setEditingId(null);
    setSelected(new Set());
    setActionError(null);
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, token, orgId]);

  // Lazily fetch reference-field option lists (contacts, products, etc.) the current entity needs.
  useEffect(() => {
    if (!token || !orgId || !config) return;
    const neededRefs = Array.from(new Set(config.fields.filter((f) => f.type === 'ref' && f.ref).map((f) => f.ref as RefKey)));
    for (const ref of neededRefs) {
      if (refCache[ref] !== undefined) continue;
      fetchRef(ref, token, orgId)
        .then((options) => setRefCache((prev) => ({ ...prev, [ref]: options })))
        .catch(() => setRefCache((prev) => ({ ...prev, [ref]: 'error' })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, token, orgId]);

  async function fetchRef(ref: RefKey, accessToken: string, organizationId: string): Promise<{ id: string; label: string }[]> {
    switch (ref) {
      case 'contacts':
        return api.contacts.list(accessToken, organizationId).then((rows) => rows.map((c) => ({ id: c.id, label: c.name })));
      case 'employees':
        return api.payroll.employees(accessToken, organizationId).then((rows) => rows.map((e) => ({ id: e.id, label: e.full_name })));
      case 'products':
        return api.ops.list(accessToken, organizationId, 'products').then((rows) => rows.map((p) => ({ id: p.id, label: `${p.sku} — ${p.name}` })));
      case 'projects':
        return api.ops.list(accessToken, organizationId, 'projects').then((rows) => rows.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` })));
      case 'accounts':
        return api.ledger.listAccounts(accessToken, organizationId).then((rows) => rows.map((a) => ({ id: a.id, label: `${a.code} ${a.name}` })));
      case 'bankAccounts':
        return api.bankAccounts.list(accessToken, organizationId).then((rows) => rows.map((a) => ({ id: a.id, label: a.name })));
      case 'invoices':
        return api.invoices.list(accessToken, organizationId).then((rows) => rows.map((i) => ({ id: i.id, label: i.invoice_number })));
      case 'bills':
        return api.bills.list(accessToken, organizationId).then((rows) => rows.map((b) => ({ id: b.id, label: b.bill_number })));
      case 'expenseClaims':
        return api.ops.list(accessToken, organizationId, 'expense-claims').then((rows) => rows.map((c) => ({ id: c.id, label: c.claim_number })));
    }
  }

  function refLabel(ref: RefKey, id: unknown): string {
    if (!id) return '—';
    const options = refCache[ref];
    if (!options || options === 'error') return String(id).slice(0, 8) + '…';
    return options.find((o) => o.id === id)?.label || String(id).slice(0, 8) + '…';
  }

  const filtered = useMemo(() => {
    if (!config) return [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      let matchesSearch = !q;
      if (!matchesSearch) {
        const haystack = config.fields
          .map((f) => (f.type === 'ref' && f.ref ? refLabel(f.ref, r[f.key]) : formatCell(r[f.key])))
          .join(' ')
          .toLowerCase();
        matchesSearch = haystack.includes(q);
      }
      if (!matchesSearch) return false;
      if (statusFilter === 'All' || !config.statusField) return true;
      if (config.statusField === 'is_active') {
        return statusFilter === 'Active' ? r.is_active === true : r.is_active === false;
      }
      return r[config.statusField] === statusFilter;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, statusFilter, config, refCache]);

  if (!config) {
    return (
      <section>
        <div className="page-head">
          <div>
            <div className="eyebrow">Hero Accounting</div>
            <h1>Not found</h1>
            <p>This module isn't set up yet.</p>
          </div>
        </div>
      </section>
    );
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function defaultDraft(): Record<string, any> {
    const d: Record<string, any> = { ...config.fixedCreateValues };
    for (const f of config.fields) {
      if (f.key in d) continue;
      if (f.type === 'checkbox') d[f.key] = true;
      else if (f.type === 'lines') d[f.key] = [DEFAULT_LINE()];
      else if (f.type === 'select') d[f.key] = f.options?.[0] || '';
      else d[f.key] = '';
    }
    return d;
  }

  function openCreate() {
    setEditingId(null);
    setDraft(defaultDraft());
    setActionError(null);
    setShowForm(true);
  }

  function openEdit(row: OpsRecord) {
    setEditingId(row.id);
    const d: Record<string, any> = {};
    for (const f of config.fields) {
      let v = row[f.key];
      if (f.type === 'date' && typeof v === 'string') v = v.slice(0, 10);
      if (f.type === 'lines' && !Array.isArray(v)) v = [DEFAULT_LINE()];
      d[f.key] = v ?? (f.type === 'checkbox' ? false : '');
    }
    setDraft(d);
    setActionError(null);
    setShowForm(true);
  }

  async function save() {
    if (!token || !orgId) return;
    setSaving(true);
    setActionError(null);
    try {
      const body: Record<string, unknown> = {};
      for (const f of config.fields) {
        const v = draft[f.key];
        if (f.type === 'lines') {
          body[f.key] = (v || []).filter((l: any) => l.description || l.unitPrice);
        } else if (v !== '' && v !== undefined) {
          body[f.key] = v;
        }
      }
      if (editingId) {
        const updated = await api.ops.update(token, orgId, config.backendEntity, editingId, body);
        setRows((prev) => prev.map((r) => (r.id === editingId ? updated : r)));
      } else {
        const created = await api.ops.create(token, orgId, config.backendEntity, body);
        setRows((prev) => [created, ...prev]);
      }
      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not save this record.');
    } finally {
      setSaving(false);
    }
  }

  async function removeRow(id: string) {
    if (!token || !orgId) return;
    if (!confirm('Delete this record? This cannot be undone.')) return;
    setActionError(null);
    try {
      await api.ops.remove(token, orgId, config.backendEntity, id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not delete this record.');
    }
  }

  async function bulkDelete() {
    if (!token || !orgId || selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} record(s)? This cannot be undone.`)) return;
    setActionError(null);
    try {
      const result = await api.ops.bulkDelete(token, orgId, config.backendEntity, Array.from(selected));
      setRows((prev) => prev.filter((r) => !result.deleted.includes(r.id)));
      setSelected(new Set());
      if (result.skipped.length > 0) {
        setActionError(`${result.skipped.length} record(s) couldn't be deleted: ${result.skipped[0].reason}`);
      }
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not delete the selected records.');
    }
  }

  async function generateNow(id: string) {
    if (!token || !orgId) return;
    setGeneratingId(id);
    setActionError(null);
    try {
      if (config.rowAction === 'generate-invoice') {
        const result = await api.ops.generateInvoiceNow(token, orgId, id);
        alert(`Invoice ${result.invoice.invoice_number} created for ${result.invoice.total}.`);
      } else if (config.rowAction === 'generate-bill') {
        const result = await api.ops.generateBillNow(token, orgId, id);
        alert(`Bill ${result.bill.bill_number} created for ${result.bill.total}.`);
      }
      loadRows();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not generate this document.');
    } finally {
      setGeneratingId(null);
    }
  }

  function exportCsv() {
    const keys = config.tableFieldKeys;
    const csv = toCsv(filtered, keys, (key, value) => {
      const field = config.fields.find((f) => f.key === key);
      if (field?.type === 'ref' && field.ref) return refLabel(field.ref, value);
      return formatCell(value);
    });
    downloadCsv(`${config.backendEntity}.csv`, csv);
  }

  const statusOptions = config.statusField === 'is_active' ? ['Active', 'Inactive'] : config.statusOptions || [];

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="eyebrow">Hero Accounting</div>
          <h1>{config.title}</h1>
          <p>{config.subtitle}</p>
        </div>
        <button className="primary-btn" onClick={openCreate}>
          ＋ {config.action}
        </button>
      </div>

      <div className="module-toolbar">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${config.title.toLowerCase()}...`} />
        {statusOptions.length > 0 && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option>All</option>
            {statusOptions.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        )}
        {selected.size > 0 && (
          <button className="ghost-btn" onClick={bulkDelete}>
            Delete {selected.size} selected
          </button>
        )}
        <button className="ghost-btn" onClick={exportCsv} disabled={filtered.length === 0}>
          Export
        </button>
      </div>

      {actionError && (
        <div style={{ background: '#fbe9e9', color: '#a33', borderRadius: 8, padding: '10px 14px', fontSize: 12, marginBottom: 12 }}>
          {actionError}
        </div>
      )}

      <div className="module-grid">
        <div className="table-card">
          <div className="table-title">
            <div>
              <b>{config.title}</b>
              <span>{loading ? 'Loading…' : `${filtered.length} record${filtered.length === 1 ? '' : 's'}`}</span>
            </div>
          </div>
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 28 }}>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(filtered.map((r) => r.id)))}
                      aria-label="Select all"
                    />
                  </th>
                  {config.tableFieldKeys.map((k) => (
                    <th key={k}>{config.fields.find((f) => f.key === k)?.label || k}</th>
                  ))}
                  {config.statusField && <th>Status</th>}
                  <th style={{ width: 170 }}></th>
                </tr>
              </thead>
              <tbody>
                {loadError ? (
                  <tr>
                    <td colSpan={config.tableFieldKeys.length + 3} style={{ textAlign: 'center', color: '#a33', padding: '24px 0' }}>
                      {loadError}
                    </td>
                  </tr>
                ) : !loading && filtered.length === 0 ? (
                  <tr>
                    <td colSpan={config.tableFieldKeys.length + 3} style={{ textAlign: 'center', color: '#89958f', padding: '24px 0' }}>
                      No records match your search.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelected(r.id)} aria-label="Select row" />
                      </td>
                      {config.tableFieldKeys.map((k, i) => {
                        const field = config.fields.find((f) => f.key === k);
                        const display = field?.type === 'ref' && field.ref ? refLabel(field.ref, r[k]) : formatCell(r[k]);
                        return i === 0 ? (
                          <td key={k}>
                            <strong>{display}</strong>
                          </td>
                        ) : (
                          <td key={k}>{display}</td>
                        );
                      })}
                      {config.statusField && (
                        <td>
                          <span className={`status status-${config.statusField === 'is_active' ? (r.is_active ? 'active' : 'draft') : String(r.status || '').toLowerCase()}`}>
                            {config.statusField === 'is_active' ? (r.is_active ? 'Active' : 'Inactive') : r.status}
                          </span>
                        </td>
                      )}
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {config.rowAction && (
                          <button
                            className="ghost-btn"
                            style={{ padding: '5px 9px', marginRight: 4 }}
                            disabled={generatingId === r.id}
                            onClick={() => generateNow(r.id)}
                          >
                            {generatingId === r.id ? 'Generating…' : 'Generate now'}
                          </button>
                        )}
                        <button className="ghost-btn" style={{ padding: '5px 9px' }} onClick={() => openEdit(r)}>
                          Edit
                        </button>{' '}
                        <button className="ghost-btn" style={{ padding: '5px 9px', color: '#c44e4e' }} onClick={() => removeRow(r.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <aside className="side-card">
          <div className="side-icon">✦</div>
          <h3>Live data</h3>
          <p>
            {config.title} are stored on your Hero Accounting backend, scoped to this organization. Changes here are
            saved immediately and visible to everyone on your team.
          </p>
          <div className="mini-row">
            <span>Records</span>
            <b>{rows.length}</b>
          </div>
        </aside>
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <b>{editingId ? `Edit ${config.title.toLowerCase()}` : config.action}</b>
                <span>{editingId ? 'Update this record' : `Create a new ${config.title.toLowerCase()} record`}</span>
              </div>
              <button onClick={() => setShowForm(false)}>×</button>
            </div>

            {config.fields.map((f) => {
              if (f.key in (config.fixedCreateValues || {})) return null;
              if (f.type === 'lines') {
                const lines = (draft[f.key] || []) as { description: string; quantity: string; unitPrice: string; taxRateCode: string }[];
                return (
                  <label key={f.key}>
                    {f.label}
                    <div style={{ border: '1px solid #dce4df', borderRadius: 8, padding: 10, marginTop: 5 }}>
                      {lines.map((line, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px 90px 26px', gap: 6, marginBottom: 6 }}>
                          <input
                            placeholder="Description"
                            value={line.description}
                            onChange={(e) => {
                              const next = [...lines];
                              next[i] = { ...next[i], description: e.target.value };
                              setDraft((d) => ({ ...d, [f.key]: next }));
                            }}
                          />
                          <input
                            placeholder="Qty"
                            value={line.quantity}
                            onChange={(e) => {
                              const next = [...lines];
                              next[i] = { ...next[i], quantity: e.target.value };
                              setDraft((d) => ({ ...d, [f.key]: next }));
                            }}
                          />
                          <input
                            placeholder="Unit price"
                            value={line.unitPrice}
                            onChange={(e) => {
                              const next = [...lines];
                              next[i] = { ...next[i], unitPrice: e.target.value };
                              setDraft((d) => ({ ...d, [f.key]: next }));
                            }}
                          />
                          <input
                            placeholder="Tax code"
                            value={line.taxRateCode}
                            onChange={(e) => {
                              const next = [...lines];
                              next[i] = { ...next[i], taxRateCode: e.target.value };
                              setDraft((d) => ({ ...d, [f.key]: next }));
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setDraft((d) => ({ ...d, [f.key]: lines.filter((_, idx) => idx !== i) }))}
                            style={{ border: 0, background: 'transparent', cursor: 'pointer' }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => setDraft((d) => ({ ...d, [f.key]: [...lines, DEFAULT_LINE()] }))}
                      >
                        + Add line
                      </button>
                    </div>
                  </label>
                );
              }
              if (f.type === 'checkbox') {
                return (
                  <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={!!draft[f.key]}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.checked }))}
                    />
                    {f.label}
                  </label>
                );
              }
              if (f.type === 'select') {
                return (
                  <label key={f.key}>
                    {f.label}
                    <select value={draft[f.key] || ''} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}>
                      {(f.options || []).map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </label>
                );
              }
              if (f.type === 'ref' && f.ref) {
                const options = refCache[f.ref];
                if (options === 'error' || options === undefined) {
                  return (
                    <label key={f.key}>
                      {f.label} {options === 'error' ? '(paste ID — list unavailable)' : '(loading…)'}
                      <input
                        value={draft[f.key] || ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                        placeholder={`${REF_LABELS[f.ref]} ID`}
                      />
                    </label>
                  );
                }
                return (
                  <label key={f.key}>
                    {f.label}
                    <select value={draft[f.key] || ''} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}>
                      <option value="">{f.required ? 'Select…' : 'None'}</option>
                      {options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }
              if (f.type === 'textarea') {
                return (
                  <label key={f.key}>
                    {f.label}
                    <textarea value={draft[f.key] || ''} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
                  </label>
                );
              }
              return (
                <label key={f.key}>
                  {f.label}
                  <input
                    type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                    value={draft[f.key] || ''}
                    placeholder={f.placeholder}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  />
                </label>
              );
            })}

            {actionError && <p style={{ color: '#a33', fontSize: 12, marginTop: 8 }}>{actionError}</p>}

            <div className="modal-actions">
              <button className="ghost-btn" onClick={() => setShowForm(false)} disabled={saving}>
                Cancel
              </button>
              <button className="primary-btn" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
