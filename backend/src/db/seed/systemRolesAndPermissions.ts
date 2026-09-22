import 'dotenv/config';
import { getPool, closePool, withRlsBypass } from '../pool';

// Matches §7 of the master brief (RBAC section) — a representative subset
// of permissions for Phase 1's actual modules (auth, contacts, ledger,
// invoices). More are added as modules are built, not invented up front.
export const PERMISSIONS: { key: string; description: string }[] = [
  { key: 'org.manage', description: 'Manage organization settings and members' },
  { key: 'contact.create', description: 'Create customers/suppliers' },
  { key: 'contact.read', description: 'View customers/suppliers' },
  { key: 'contact.update', description: 'Edit customers/suppliers' },
  { key: 'invoice.create', description: 'Create invoices' },
  { key: 'invoice.read', description: 'View invoices' },
  { key: 'invoice.update', description: 'Edit draft invoices' },
  { key: 'invoice.send', description: 'Send invoices (posts to ledger)' },
  { key: 'invoice.void', description: 'Void invoices' },
  { key: 'ledger.read', description: 'View chart of accounts and journal' },
  { key: 'ledger.post_manual', description: 'Post manual journal entries' },
  { key: 'bill.create', description: 'Create supplier bills' },
  { key: 'bill.read', description: 'View supplier bills' },
  { key: 'bill.update', description: 'Edit draft bills' },
  { key: 'bill.approve', description: 'Approve bills (posts to ledger)' },
  { key: 'bill.pay', description: 'Record a bill as paid (posts to ledger)' },
  { key: 'bank.read', description: 'View bank accounts and transactions' },
  { key: 'bank.import', description: 'Import bank transactions' },
  { key: 'bank.reconcile', description: 'Match and reconcile bank transactions' },
  { key: 'report.read', description: 'View financial reports (P&L, Balance Sheet, Trial Balance)' },

  // Phase 2/3 operational modules (quotes, expenses, inventory, projects, etc.)
  // grouped by domain — see src/modules/operations/operations.registry.ts.
  { key: 'sales_ops.read', description: 'View quotes, credit notes, customer payments, recurring invoices' },
  { key: 'sales_ops.manage', description: 'Create/edit/delete quotes, credit notes, customer payments, recurring invoices' },
  { key: 'purchase_ops.read', description: 'View purchase orders, supplier payments, recurring bills' },
  { key: 'purchase_ops.manage', description: 'Create/edit/delete purchase orders, supplier payments, recurring bills' },
  { key: 'banking_ops.read', description: 'View bank rules' },
  { key: 'banking_ops.manage', description: 'Create/edit/delete bank rules' },
  { key: 'ledger_ops.read', description: 'View opening balances and accounting periods' },
  { key: 'ledger_ops.manage', description: 'Create/edit/delete opening balances and accounting periods' },
  { key: 'expense_ops.read', description: 'View expenses, expense claims, reimbursements' },
  { key: 'expense_ops.manage', description: 'Create/edit/delete expenses, expense claims, reimbursements' },
  { key: 'inventory_ops.read', description: 'View products and stock movements' },
  { key: 'inventory_ops.manage', description: 'Create/edit/delete products and stock movements' },
  { key: 'asset_ops.read', description: 'View fixed assets' },
  { key: 'asset_ops.manage', description: 'Create/edit/delete/depreciate/dispose fixed assets' },
  { key: 'project_ops.read', description: 'View projects, time entries, project costs and budgets' },
  { key: 'project_ops.manage', description: 'Create/edit/delete projects, time entries, project costs and budgets' },
  { key: 'file_ops.read', description: 'View files & documents' },
  { key: 'file_ops.manage', description: 'Upload/delete files & documents' },
  { key: 'ai.use', description: 'Use the Ask Hero AI assistant' },
];

// System roles → permission keys. "Owner" gets everything implicitly at the
// guard level (see PermissionsGuard), everyone else is explicit.
export const SYSTEM_ROLES: Record<string, string[]> = {
  Owner: PERMISSIONS.map((p) => p.key),
  Administrator: PERMISSIONS.map((p) => p.key),
  Accountant: [
    'contact.create', 'contact.read', 'contact.update',
    'invoice.create', 'invoice.read', 'invoice.update', 'invoice.send', 'invoice.void',
    'bill.create', 'bill.read', 'bill.update', 'bill.approve', 'bill.pay',
    'bank.read', 'bank.import', 'bank.reconcile',
    'ledger.read', 'ledger.post_manual', 'report.read',
    'sales_ops.read', 'sales_ops.manage', 'purchase_ops.read', 'purchase_ops.manage',
    'banking_ops.read', 'banking_ops.manage', 'ledger_ops.read', 'ledger_ops.manage',
    'expense_ops.read', 'expense_ops.manage', 'inventory_ops.read', 'inventory_ops.manage',
    'asset_ops.read', 'asset_ops.manage', 'project_ops.read', 'project_ops.manage',
    'file_ops.read', 'file_ops.manage', 'ai.use',
  ],
  Bookkeeper: [
    'contact.create', 'contact.read', 'contact.update',
    'invoice.create', 'invoice.read', 'invoice.update', 'invoice.send',
    'bill.create', 'bill.read', 'bill.update',
    'bank.read', 'bank.import', 'bank.reconcile',
    'ledger.read', 'report.read',
    'sales_ops.read', 'sales_ops.manage', 'purchase_ops.read', 'purchase_ops.manage',
    'banking_ops.read', 'banking_ops.manage', 'ledger_ops.read', 'ledger_ops.manage',
    'expense_ops.read', 'expense_ops.manage', 'inventory_ops.read', 'inventory_ops.manage',
    'asset_ops.read', 'asset_ops.manage', 'project_ops.read', 'project_ops.manage',
    'file_ops.read', 'file_ops.manage', 'ai.use',
  ],
  SalesStaff: [
    'contact.read', 'contact.create', 'invoice.create', 'invoice.read', 'invoice.update',
    'sales_ops.read', 'sales_ops.manage', 'file_ops.read', 'file_ops.manage', 'ai.use',
  ],
  PurchaseStaff: [
    'contact.read', 'contact.create', 'bill.create', 'bill.read', 'bill.update',
    'purchase_ops.read', 'purchase_ops.manage', 'file_ops.read', 'file_ops.manage', 'ai.use',
  ],
  ReadOnly: [
    'contact.read', 'invoice.read', 'bill.read', 'bank.read', 'ledger.read', 'report.read',
    'sales_ops.read', 'purchase_ops.read', 'banking_ops.read', 'ledger_ops.read',
    'expense_ops.read', 'inventory_ops.read', 'asset_ops.read', 'project_ops.read', 'file_ops.read',
  ],
};

export async function seedSystemRolesAndPermissions(): Promise<void> {
  await withRlsBypass(async () => {
    const pool = getPool();

    for (const perm of PERMISSIONS) {
      await pool.query(
        `INSERT INTO permissions (key, description) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description`,
        [perm.key, perm.description],
      );
    }

    for (const [roleName, permKeys] of Object.entries(SYSTEM_ROLES)) {
      // Note: organization_id is NULL for system roles, and Postgres treats
      // NULL <> NULL in unique constraints, so ON CONFLICT (organization_id,
      // name) cannot detect existing system roles. Check-then-insert instead.
      const existing = await pool.query(
        `SELECT id FROM roles WHERE organization_id IS NULL AND name = $1`,
        [roleName],
      );
      const roleId = existing.rows[0]
        ? existing.rows[0].id
        : (
            await pool.query(
              `INSERT INTO roles (organization_id, name, is_system) VALUES (NULL, $1, TRUE) RETURNING id`,
              [roleName],
            )
          ).rows[0].id;

      for (const key of permKeys) {
        await pool.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           SELECT $1, id FROM permissions WHERE key = $2
           ON CONFLICT DO NOTHING`,
          [roleId, key],
        );
      }
    }
  });
}

if (require.main === module) {
  seedSystemRolesAndPermissions()
    .then(() => {
      console.log('system roles and permissions seeded');
      return closePool();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}