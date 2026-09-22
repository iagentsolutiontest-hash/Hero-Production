import { Pool } from 'pg';

export interface DocumentBalance {
  total: string;
  paid: string;
  remaining: string;
}

function centsEqual(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

export async function getInvoiceBalance(pool: Pool, organizationId: string, invoiceId: string): Promise<DocumentBalance> {
  const invoiceResult = await pool.query(
    `SELECT total FROM invoices WHERE id = $1 AND organization_id = $2`,
    [invoiceId, organizationId],
  );
  const total = parseFloat(invoiceResult.rows[0]?.total ?? '0');
  const paidResult = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = $1`,
    [invoiceId],
  );
  const paid = parseFloat(paidResult.rows[0].paid);
  return { total: total.toFixed(2), paid: paid.toFixed(2), remaining: (total - paid).toFixed(2) };
}

export async function getBillBalance(pool: Pool, organizationId: string, billId: string): Promise<DocumentBalance> {
  const billResult = await pool.query(
    `SELECT total FROM bills WHERE id = $1 AND organization_id = $2`,
    [billId, organizationId],
  );
  const total = parseFloat(billResult.rows[0]?.total ?? '0');
  const paidResult = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE bill_id = $1`,
    [billId],
  );
  const paid = parseFloat(paidResult.rows[0].paid);
  return { total: total.toFixed(2), paid: paid.toFixed(2), remaining: (total - paid).toFixed(2) };
}

export async function recomputeInvoiceStatus(pool: Pool, organizationId: string, invoiceId: string): Promise<string> {
  const current = await pool.query(`SELECT status FROM invoices WHERE id = $1 AND organization_id = $2`, [
    invoiceId,
    organizationId,
  ]);
  if (current.rows.length === 0 || current.rows[0].status === 'VOID') {
    return current.rows[0]?.status;
  }
  const balance = await getInvoiceBalance(pool, organizationId, invoiceId);
  const total = parseFloat(balance.total);
  const paid = parseFloat(balance.paid);
  let status: string;
  if (centsEqual(paid, 0)) status = 'SENT';
  else if (paid >= total || centsEqual(paid, total)) status = 'PAID';
  else status = 'PARTIALLY_PAID';
  await pool.query(`UPDATE invoices SET status = $1 WHERE id = $2`, [status, invoiceId]);
  return status;
}

export async function recomputeBillStatus(pool: Pool, organizationId: string, billId: string): Promise<string> {
  const current = await pool.query(`SELECT status FROM bills WHERE id = $1 AND organization_id = $2`, [
    billId,
    organizationId,
  ]);
  if (current.rows.length === 0) return current.rows[0]?.status;
  const balance = await getBillBalance(pool, organizationId, billId);
  const total = parseFloat(balance.total);
  const paid = parseFloat(balance.paid);
  let status: string;
  if (centsEqual(paid, 0)) status = 'APPROVED';
  else if (paid >= total || centsEqual(paid, total)) status = 'PAID';
  else status = 'PARTIALLY_PAID';
  await pool.query(`UPDATE bills SET status = $1 WHERE id = $2`, [status, billId]);
  return status;
}
