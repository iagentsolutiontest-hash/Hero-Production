/**
 * Declarative registry for the "Phase 2/3" operational modules added in
 * migrations 0007/0008 (quotes, expenses, inventory, projects, etc).
 *
 * Rather than hand-writing 20 near-identical controller/service files, each
 * entity declares its table + column shape here, and OperationsService
 * builds parameterized SQL from it. The entity `key` is also the URL
 * segment under /api/v1/ops/:entity, so it is validated against this list
 * before ever touching a table name — that's what keeps dynamic table
 * names safe from injection (never taken from user input unchecked).
 */

import { NotFoundException } from '@nestjs/common';

export type FieldKind = 'text' | 'numeric' | 'date' | 'boolean' | 'json' | 'uuid' | 'timestamptz' | 'int';

export interface OpsFieldDef {
  /** Key used in request/response JSON and the DB column name (kept identical for simplicity). */
  column: string;
  kind: FieldKind;
  required?: boolean;
  /** SQL literal default used only when the column is omitted on create (columns already have DB defaults too). */
  default?: string | number | boolean;
}

export interface OpsEntityConfig {
  key: string;
  table: string;
  /** Columns beyond id/organization_id/created_at that the API can read/write. */
  fields: OpsFieldDef[];
  hasUpdatedAt: boolean;
  orderBy: string;
  /** Permission domain prefix — checked as `${domain}.read` / `${domain}.manage`. */
  permissionDomain: string;
  /** Columns that may be used as exact-match query filters, e.g. ?status=DRAFT. */
  filterable: string[];
}

function castFor(kind: FieldKind): string {
  switch (kind) {
    case 'json':
      return '::jsonb';
    case 'numeric':
      return '::numeric';
    case 'int':
      return '::integer';
    case 'date':
      return '::date';
    case 'timestamptz':
      return '::timestamptz';
    case 'boolean':
      return '::boolean';
    case 'uuid':
      return '::uuid';
    default:
      return '::text';
  }
}

export { castFor };

export const OPERATIONS_REGISTRY: Record<string, OpsEntityConfig> = {
  quotes: {
    key: 'quotes',
    table: 'quotes',
    hasUpdatedAt: true,
    orderBy: 'issue_date DESC, created_at DESC',
    permissionDomain: 'sales_ops',
    filterable: ['status', 'contact_id'],
    fields: [
      { column: 'contact_id', kind: 'uuid' },
      { column: 'quote_number', kind: 'text', required: true },
      { column: 'issue_date', kind: 'date', required: true },
      { column: 'expiry_date', kind: 'date' },
      { column: 'status', kind: 'text', default: 'DRAFT' },
      { column: 'currency', kind: 'text', default: 'AUD' },
      { column: 'subtotal', kind: 'numeric', default: 0 },
      { column: 'tax_total', kind: 'numeric', default: 0 },
      { column: 'total', kind: 'numeric', default: 0 },
      { column: 'notes', kind: 'text' },
      { column: 'data', kind: 'json', default: '{}' },
    ],
  },
  'credit-notes': {
    key: 'credit-notes',
    table: 'credit_notes',
    hasUpdatedAt: true,
    orderBy: 'issue_date DESC, created_at DESC',
    permissionDomain: 'sales_ops',
    filterable: ['status', 'contact_id'],
    fields: [
      { column: 'contact_id', kind: 'uuid' },
      { column: 'credit_note_number', kind: 'text', required: true },
      { column: 'issue_date', kind: 'date', required: true },
      { column: 'status', kind: 'text', default: 'DRAFT' },
      { column: 'currency', kind: 'text', default: 'AUD' },
      { column: 'subtotal', kind: 'numeric', default: 0 },
      { column: 'tax_total', kind: 'numeric', default: 0 },
      { column: 'total', kind: 'numeric', default: 0 },
      { column: 'data', kind: 'json', default: '{}' },
    ],
  },
  'purchase-orders': {
    key: 'purchase-orders',
    table: 'purchase_orders',
    hasUpdatedAt: true,
    orderBy: 'order_date DESC, created_at DESC',
    permissionDomain: 'purchase_ops',
    filterable: ['status', 'contact_id'],
    fields: [
      { column: 'contact_id', kind: 'uuid' },
      { column: 'po_number', kind: 'text', required: true },
      { column: 'order_date', kind: 'date', required: true },
      { column: 'status', kind: 'text', default: 'DRAFT' },
      { column: 'currency', kind: 'text', default: 'AUD' },
      { column: 'total', kind: 'numeric', default: 0 },
      { column: 'data', kind: 'json', default: '{}' },
    ],
  },
  'customer-payments': {
    key: 'customer-payments',
    table: 'customer_payments',
    hasUpdatedAt: false,
    orderBy: 'payment_date DESC, created_at DESC',
    permissionDomain: 'sales_ops',
    filterable: ['status', 'contact_id', 'invoice_id'],
    fields: [
      { column: 'contact_id', kind: 'uuid' },
      { column: 'invoice_id', kind: 'uuid' },
      { column: 'payment_date', kind: 'date', required: true },
      { column: 'amount', kind: 'numeric', required: true },
      { column: 'currency', kind: 'text', default: 'AUD' },
      { column: 'reference', kind: 'text' },
      { column: 'bank_account_id', kind: 'uuid' },
      { column: 'status', kind: 'text', default: 'POSTED' },
      { column: 'data', kind: 'json', default: '{}' },
    ],
  },
  'supplier-payments': {
    key: 'supplier-payments',
    table: 'supplier_payments',
    hasUpdatedAt: false,
    orderBy: 'payment_date DESC, created_at DESC',
    permissionDomain: 'purchase_ops',
    filterable: ['status', 'contact_id', 'bill_id'],
    fields: [
      { column: 'contact_id', kind: 'uuid' },
      { column: 'bill_id', kind: 'uuid' },
      { column: 'payment_date', kind: 'date', required: true },
      { column: 'amount', kind: 'numeric', required: true },
      { column: 'currency', kind: 'text', default: 'AUD' },
      { column: 'reference', kind: 'text' },
      { column: 'bank_account_id', kind: 'uuid' },
      { column: 'status', kind: 'text', default: 'POSTED' },
      { column: 'data', kind: 'json', default: '{}' },
    ],
  },
  'bank-rules': {
    key: 'bank-rules',
    table: 'bank_rules',
    hasUpdatedAt: true,
    orderBy: 'priority ASC, created_at DESC',
    permissionDomain: 'banking_ops',
    filterable: ['is_active'],
    fields: [
      { column: 'name', kind: 'text', required: true },
      { column: 'priority', kind: 'int', default: 100 },
      { column: 'conditions', kind: 'json', default: '[]' },
      { column: 'action', kind: 'json', default: '{}' },
      { column: 'is_active', kind: 'boolean', default: true },
    ],
  },
  'opening-balances': {
    key: 'opening-balances',
    table: 'opening_balances',
    hasUpdatedAt: false,
    orderBy: 'effective_date DESC, created_at DESC',
    permissionDomain: 'ledger_ops',
    filterable: ['status', 'account_id'],
    fields: [
      { column: 'account_id', kind: 'uuid', required: true },
      { column: 'effective_date', kind: 'date', required: true },
      { column: 'debit', kind: 'numeric', default: 0 },
      { column: 'credit', kind: 'numeric', default: 0 },
      { column: 'memo', kind: 'text' },
      { column: 'status', kind: 'text', default: 'DRAFT' },
    ],
  },
  'accounting-periods': {
    key: 'accounting-periods',
    table: 'accounting_periods',
    hasUpdatedAt: false,
    orderBy: 'start_date DESC',
    permissionDomain: 'ledger_ops',
    filterable: ['status'],
    fields: [
      { column: 'name', kind: 'text', required: true },
      { column: 'start_date', kind: 'date', required: true },
      { column: 'end_date', kind: 'date', required: true },
      { column: 'status', kind: 'text', default: 'OPEN' },
      { column: 'locked_at', kind: 'timestamptz' },
    ],
  },
  expenses: {
    key: 'expenses',
    table: 'expenses',
    hasUpdatedAt: false,
    orderBy: 'expense_date DESC, created_at DESC',
    permissionDomain: 'expense_ops',
    filterable: ['status', 'employee_id'],
    fields: [
      { column: 'employee_id', kind: 'uuid' },
      { column: 'vendor_name', kind: 'text' },
      { column: 'expense_date', kind: 'date', required: true },
      { column: 'amount', kind: 'numeric', required: true },
      { column: 'tax_amount', kind: 'numeric', default: 0 },
      { column: 'currency', kind: 'text', default: 'AUD' },
      { column: 'status', kind: 'text', default: 'DRAFT' },
      { column: 'description', kind: 'text' },
      { column: 'data', kind: 'json', default: '{}' },
    ],
  },
  'expense-claims': {
    key: 'expense-claims',
    table: 'expense_claims',
    hasUpdatedAt: false,
    orderBy: 'claim_date DESC, created_at DESC',
    permissionDomain: 'expense_ops',
    filterable: ['status', 'employee_id'],
    fields: [
      { column: 'employee_id', kind: 'uuid' },
      { column: 'claim_number', kind: 'text', required: true },
      { column: 'claim_date', kind: 'date', required: true },
      { column: 'amount', kind: 'numeric', required: true },
      { column: 'status', kind: 'text', default: 'DRAFT' },
      { column: 'data', kind: 'json', default: '{}' },
    ],
  },
  reimbursements: {
    key: 'reimbursements',
    table: 'reimbursements',
    hasUpdatedAt: false,
    orderBy: 'created_at DESC',
    permissionDomain: 'expense_ops',
    filterable: ['status', 'expense_claim_id'],
    fields: [
      { column: 'expense_claim_id', kind: 'uuid' },
      { column: 'payment_date', kind: 'date' },
      { column: 'amount', kind: 'numeric', required: true },
      { column: 'status', kind: 'text', default: 'PENDING' },
      { column: 'reference', kind: 'text' },
      { column: 'data', kind: 'json', default: '{}' },
    ],
  },
  products: {
    key: 'products',
    table: 'products',
    hasUpdatedAt: false,
    orderBy: 'name ASC',
    permissionDomain: 'inventory_ops',
    filterable: ['is_active'],
    fields: [
      { column: 'sku', kind: 'text', required: true },
      { column: 'name', kind: 'text', required: true },
      { column: 'description', kind: 'text' },
      { column: 'unit_price', kind: 'numeric', default: 0 },
      { column: 'purchase_price', kind: 'numeric', default: 0 },
      { column: 'tax_rate', kind: 'numeric', default: 0 },
      { column: 'quantity_on_hand', kind: 'numeric', default: 0 },
      { column: 'is_active', kind: 'boolean', default: true },
      { column: 'data', kind: 'json', default: '{}' },
    ],
  },
  'stock-movements': {
    key: 'stock-movements',
    table: 'stock_movements',
    hasUpdatedAt: false,
    orderBy: 'movement_date DESC',
    permissionDomain: 'inventory_ops',
    filterable: ['product_id', 'movement_type'],
    fields: [
      { column: 'product_id', kind: 'uuid', required: true },
      { column: 'movement_date', kind: 'timestamptz' },
      { column: 'quantity', kind: 'numeric', required: true },
      { column: 'unit_cost', kind: 'numeric', default: 0 },
      { column: 'movement_type', kind: 'text', required: true },
      { column: 'reference', kind: 'text' },
      { column: 'data', kind: 'json', default: '{}' },
    ],
  },
  'fixed-assets': {
    key: 'fixed-assets',
    table: 'fixed_assets',
    hasUpdatedAt: false,
    orderBy: 'acquisition_date DESC',
    permissionDomain: 'asset_ops',
    filterable: ['status'],
    fields: [
      { column: 'asset_code', kind: 'text', required: true },
      { column: 'name', kind: 'text', required: true },
      { column: 'acquisition_date', kind: 'date', required: true },
      { column: 'cost', kind: 'numeric', required: true },
      { column: 'residual_value', kind: 'numeric', default: 0 },
      { column: 'useful_life_months', kind: 'int', required: true },
      { column: 'accumulated_depreciation', kind: 'numeric', default: 0 },
      { column: 'status', kind: 'text', default: 'ACTIVE' },
      { column: 'data', kind: 'json', default: '{}' },
    ],
  },
  projects: {
    key: 'projects',
    table: 'projects',
    hasUpdatedAt: false,
    orderBy: 'created_at DESC',
    permissionDomain: 'project_ops',
    filterable: ['status', 'contact_id'],
    fields: [
      { column: 'code', kind: 'text', required: true },
      { column: 'name', kind: 'text', required: true },
      { column: 'contact_id', kind: 'uuid' },
      { column: 'status', kind: 'text', default: 'ACTIVE' },
      { column: 'budget', kind: 'numeric', default: 0 },
      { column: 'data', kind: 'json', default: '{}' },
    ],
  },
  'time-entries': {
    key: 'time-entries',
    table: 'time_entries',
    hasUpdatedAt: false,
    orderBy: 'entry_date DESC',
    permissionDomain: 'project_ops',
    filterable: ['project_id', 'employee_id', 'billable'],
    fields: [
      { column: 'project_id', kind: 'uuid' },
      { column: 'employee_id', kind: 'uuid' },
      { column: 'entry_date', kind: 'date', required: true },
      { column: 'hours', kind: 'numeric', required: true },
      { column: 'billable', kind: 'boolean', default: true },
      { column: 'rate', kind: 'numeric', default: 0 },
      { column: 'description', kind: 'text' },
      { column: 'data', kind: 'json', default: '{}' },
    ],
  },
  'project-costs': {
    key: 'project-costs',
    table: 'project_costs',
    hasUpdatedAt: false,
    orderBy: 'cost_date DESC',
    permissionDomain: 'project_ops',
    filterable: ['project_id'],
    fields: [
      { column: 'project_id', kind: 'uuid' },
      { column: 'cost_date', kind: 'date', required: true },
      { column: 'amount', kind: 'numeric', required: true },
      { column: 'description', kind: 'text' },
      { column: 'data', kind: 'json', default: '{}' },
    ],
  },
  'project-budgets': {
    key: 'project-budgets',
    table: 'project_budgets',
    hasUpdatedAt: false,
    orderBy: 'period_start DESC',
    permissionDomain: 'project_ops',
    filterable: ['project_id'],
    fields: [
      { column: 'project_id', kind: 'uuid' },
      { column: 'period_start', kind: 'date', required: true },
      { column: 'period_end', kind: 'date', required: true },
      { column: 'amount', kind: 'numeric', required: true },
    ],
  },
  files: {
    key: 'files',
    table: 'files_documents',
    hasUpdatedAt: false,
    orderBy: 'created_at DESC',
    permissionDomain: 'file_ops',
    filterable: ['entity_type', 'entity_id'],
    fields: [
      { column: 'name', kind: 'text', required: true },
      { column: 'mime_type', kind: 'text' },
      { column: 'storage_key', kind: 'text' },
      { column: 'size_bytes', kind: 'int' },
      { column: 'entity_type', kind: 'text' },
      { column: 'entity_id', kind: 'uuid' },
      { column: 'metadata', kind: 'json', default: '{}' },
    ],
  },
  'recurring-invoices': {
    key: 'recurring-invoices',
    table: 'recurring_invoices',
    hasUpdatedAt: false,
    orderBy: 'next_run_date ASC',
    permissionDomain: 'sales_ops',
    filterable: ['is_active', 'contact_id'],
    fields: [
      { column: 'contact_id', kind: 'uuid', required: true },
      { column: 'frequency', kind: 'text', default: 'MONTHLY' },
      { column: 'next_run_date', kind: 'date', required: true },
      { column: 'is_active', kind: 'boolean', default: true },
      { column: 'line_template', kind: 'json', required: true },
      { column: 'currency', kind: 'text', default: 'AUD' },
    ],
  },
  'recurring-bills': {
    key: 'recurring-bills',
    table: 'recurring_bills',
    hasUpdatedAt: false,
    orderBy: 'next_run_date ASC',
    permissionDomain: 'purchase_ops',
    filterable: ['is_active', 'contact_id'],
    fields: [
      { column: 'contact_id', kind: 'uuid', required: true },
      { column: 'frequency', kind: 'text', default: 'MONTHLY' },
      { column: 'next_run_date', kind: 'date', required: true },
      { column: 'is_active', kind: 'boolean', default: true },
      { column: 'line_template', kind: 'json', required: true },
      { column: 'currency', kind: 'text', default: 'AUD' },
    ],
  },
};

export function getEntityConfig(key: string): OpsEntityConfig {
  const config = OPERATIONS_REGISTRY[key];
  if (!config) {
    throw new NotFoundException(`Unknown operations entity "${key}"`);
  }
  return config;
}
