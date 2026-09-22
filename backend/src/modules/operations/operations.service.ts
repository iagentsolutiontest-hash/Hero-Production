import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getPool } from '../../db/pool';
import { getEntityConfig, castFor, OpsEntityConfig } from './operations.registry';

function toParamValue(kind: string, value: unknown): unknown {
  if (kind === 'json') {
    return typeof value === 'string' ? value : JSON.stringify(value ?? {});
  }
  return value;
}

@Injectable()
export class OperationsService {
  /** List all rows for an entity in this org, optionally filtered by exact-match query params. */
  async list(organizationId: string, entityKey: string, filters: Record<string, string>) {
    const config = getEntityConfig(entityKey);
    const pool = getPool();
    const clauses = ['organization_id = $1'];
    const values: unknown[] = [organizationId];

    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === '') continue;
      if (!config.filterable.includes(key)) continue;
      const field = config.fields.find((f) => f.column === key);
      values.push(value);
      clauses.push(`${key} = $${values.length}${field ? castFor(field.kind) : ''}`);
    }

    const sql = `SELECT * FROM ${config.table} WHERE ${clauses.join(' AND ')} ORDER BY ${config.orderBy}`;
    const result = await pool.query(sql, values);
    return result.rows;
  }

  async getOne(organizationId: string, entityKey: string, id: string) {
    const config = getEntityConfig(entityKey);
    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM ${config.table} WHERE id = $1 AND organization_id = $2`,
      [id, organizationId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`${config.key} record not found`);
    }
    return result.rows[0];
  }

  async create(organizationId: string, entityKey: string, body: Record<string, unknown>) {
    const config = getEntityConfig(entityKey);
    const pool = getPool();

    const columns: string[] = ['organization_id'];
    const placeholders: string[] = ['$1'];
    const values: unknown[] = [organizationId];

    for (const field of config.fields) {
      const provided = body[field.column];
      if (provided === undefined || provided === null || provided === '') {
        if (field.required && field.default === undefined) {
          throw new BadRequestException(`"${field.column}" is required`);
        }
        if (field.default === undefined) continue; // let the DB's own column default apply
        values.push(toParamValue(field.kind, field.default));
      } else {
        values.push(toParamValue(field.kind, provided));
      }
      columns.push(field.column);
      placeholders.push(`$${values.length}${castFor(field.kind)}`);
    }

    const sql = `INSERT INTO ${config.table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    const result = await pool.query(sql, values);
    const row = result.rows[0];

    await this.runAfterCreate(organizationId, config, row);
    return row;
  }

  async update(organizationId: string, entityKey: string, id: string, body: Record<string, unknown>) {
    const config = getEntityConfig(entityKey);
    const pool = getPool();

    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (const field of config.fields) {
      if (!(field.column in body)) continue;
      const provided = body[field.column];
      values.push(toParamValue(field.kind, provided));
      setClauses.push(`${field.column} = $${values.length}${castFor(field.kind)}`);
    }

    if (setClauses.length === 0) {
      throw new BadRequestException('No updatable fields provided');
    }
    if (config.hasUpdatedAt) {
      setClauses.push('updated_at = now()');
    }

    values.push(id, organizationId);
    const sql = `UPDATE ${config.table} SET ${setClauses.join(', ')} WHERE id = $${values.length - 1} AND organization_id = $${values.length} RETURNING *`;
    const result = await pool.query(sql, values);
    if (result.rows.length === 0) {
      throw new NotFoundException(`${config.key} record not found`);
    }
    return result.rows[0];
  }

  async remove(organizationId: string, entityKey: string, id: string) {
    const config = getEntityConfig(entityKey);
    const pool = getPool();
    const result = await pool.query(
      `DELETE FROM ${config.table} WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [id, organizationId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`${config.key} record not found`);
    }
    return { id, deleted: true };
  }

  async bulkDelete(organizationId: string, entityKey: string, ids: string[]) {
    const deleted: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const id of ids) {
      try {
        await this.remove(organizationId, entityKey, id);
        deleted.push(id);
      } catch (err: any) {
        skipped.push({ id, reason: err?.message || 'Could not delete' });
      }
    }
    return { deleted, skipped };
  }

  /** Entity-specific side effects that a plain column INSERT can't express. */
  private async runAfterCreate(organizationId: string, config: OpsEntityConfig, row: any): Promise<void> {
    if (config.key === 'stock-movements') {
      const pool = getPool();
      // Signed quantity: positive increases stock, negative decreases it.
      await pool.query(
        `UPDATE products SET quantity_on_hand = quantity_on_hand + $1::numeric WHERE id = $2 AND organization_id = $3`,
        [row.quantity, row.product_id, organizationId],
      );
    }
  }

  // ---- Fixed asset actions (asset_ops.manage) ----

  /** Straight-line monthly depreciation, capped so accumulated depreciation never exceeds cost - residual. */
  async runDepreciation(organizationId: string, assetId: string) {
    const pool = getPool();
    const asset = await this.getOne(organizationId, 'fixed-assets', assetId);
    if (asset.status !== 'ACTIVE') {
      throw new BadRequestException('Only active assets can be depreciated');
    }
    const cost = parseFloat(asset.cost);
    const residual = parseFloat(asset.residual_value);
    const usefulLifeMonths = Number(asset.useful_life_months) || 1;
    const accumulated = parseFloat(asset.accumulated_depreciation);
    const depreciableBase = Math.max(cost - residual, 0);
    const monthly = depreciableBase / usefulLifeMonths;
    const remaining = Math.max(depreciableBase - accumulated, 0);
    const amount = Math.min(monthly, remaining);

    if (amount <= 0) {
      return { asset, amountPosted: '0.00', message: 'Asset is already fully depreciated' };
    }

    const result = await pool.query(
      `UPDATE fixed_assets SET accumulated_depreciation = accumulated_depreciation + $1::numeric
       WHERE id = $2 AND organization_id = $3 RETURNING *`,
      [amount.toFixed(2), assetId, organizationId],
    );
    return { asset: result.rows[0], amountPosted: amount.toFixed(2) };
  }

  async disposeAsset(
    organizationId: string,
    assetId: string,
    input: { disposalDate: string; proceeds?: string; reason?: string },
  ) {
    const pool = getPool();
    const asset = await this.getOne(organizationId, 'fixed-assets', assetId);
    if (asset.status === 'DISPOSED') {
      throw new BadRequestException('Asset already disposed');
    }
    const data = { ...(asset.data || {}), disposal: { date: input.disposalDate, proceeds: input.proceeds ?? '0.00', reason: input.reason ?? '' } };
    const result = await pool.query(
      `UPDATE fixed_assets SET status = 'DISPOSED', data = $1::jsonb WHERE id = $2 AND organization_id = $3 RETURNING *`,
      [JSON.stringify(data), assetId, organizationId],
    );
    return result.rows[0];
  }

  // ---- Read-only computed reports over the operational tables ----

  async inventoryValuation(organizationId: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, sku, name, quantity_on_hand, purchase_price,
              (quantity_on_hand * purchase_price) AS value
       FROM products WHERE organization_id = $1 AND is_active = TRUE ORDER BY name`,
      [organizationId],
    );
    const totalValue = result.rows.reduce((sum, r) => sum + parseFloat(r.value || '0'), 0);
    return { rows: result.rows, totalValue: totalValue.toFixed(2) };
  }

  async cashFlowForecast(organizationId: string, months: number) {
    const pool = getPool();
    const inflows = await pool.query(
      `SELECT to_char(date_trunc('month', due_date), 'YYYY-MM') AS month,
              COALESCE(SUM(total), 0) AS expected
       FROM invoices
       WHERE organization_id = $1 AND status IN ('SENT', 'PARTIALLY_PAID', 'OVERDUE')
         AND due_date >= date_trunc('month', now()) AND due_date < date_trunc('month', now()) + ($2 || ' months')::interval
       GROUP BY 1 ORDER BY 1`,
      [organizationId, months],
    );
    const outflows = await pool.query(
      `SELECT to_char(date_trunc('month', due_date), 'YYYY-MM') AS month,
              COALESCE(SUM(total), 0) AS expected
       FROM bills
       WHERE organization_id = $1 AND status IN ('APPROVED', 'PARTIALLY_PAID')
         AND due_date >= date_trunc('month', now()) AND due_date < date_trunc('month', now()) + ($2 || ' months')::interval
       GROUP BY 1 ORDER BY 1`,
      [organizationId, months],
    );
    return { inflows: inflows.rows, outflows: outflows.rows };
  }

  async budgetVsActual(organizationId: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT p.id AS project_id, p.code, p.name,
              COALESCE(SUM(pb.amount), 0) AS budgeted,
              COALESCE((SELECT SUM(pc.amount) FROM project_costs pc WHERE pc.project_id = p.id), 0) AS actual
       FROM projects p
       LEFT JOIN project_budgets pb ON pb.project_id = p.id
       WHERE p.organization_id = $1
       GROUP BY p.id, p.code, p.name
       ORDER BY p.name`,
      [organizationId],
    );
    return result.rows.map((r) => ({
      ...r,
      variance: (parseFloat(r.budgeted) - parseFloat(r.actual)).toFixed(2),
    }));
  }

  async analyticsSummary(organizationId: string) {
    const pool = getPool();
    const [contacts, invoices, bills, ar, ap] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS n FROM contacts WHERE organization_id = $1`, [organizationId]),
      pool.query(
        `SELECT status, COUNT(*) AS n, COALESCE(SUM(total), 0) AS total FROM invoices WHERE organization_id = $1 GROUP BY status`,
        [organizationId],
      ),
      pool.query(
        `SELECT status, COUNT(*) AS n, COALESCE(SUM(total), 0) AS total FROM bills WHERE organization_id = $1 GROUP BY status`,
        [organizationId],
      ),
      pool.query(
        `SELECT COALESCE(SUM(total), 0) AS total FROM invoices WHERE organization_id = $1 AND status IN ('SENT','PARTIALLY_PAID','OVERDUE')`,
        [organizationId],
      ),
      pool.query(
        `SELECT COALESCE(SUM(total), 0) AS total FROM bills WHERE organization_id = $1 AND status IN ('APPROVED', 'PARTIALLY_PAID')`,
        [organizationId],
      ),
    ]);
    return {
      contactCount: Number(contacts.rows[0].n),
      invoicesByStatus: invoices.rows,
      billsByStatus: bills.rows,
      accountsReceivable: ar.rows[0].total,
      accountsPayable: ap.rows[0].total,
    };
  }
}
