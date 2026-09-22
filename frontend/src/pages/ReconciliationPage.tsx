import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { api } from '../lib/api';
import type { BankAccount, BankTransaction, InvoiceSummary, BillSummary } from '../lib/api';
import { StatusPill } from '../components/StatusPill';

function money(v: string) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(parseFloat(v));
}

export function ReconciliationPage() {
  const { session, activeOrg } = useSession();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [txns, setTxns] = useState<BankTransaction[]>([]);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [bills, setBills] = useState<BillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!session || !activeOrg) return;
    setLoading(true);
    const [acc, tx, inv, bl] = await Promise.all([
      api.bankAccounts.list(session.accessToken, activeOrg.id),
      api.bankTransactions.list(session.accessToken, activeOrg.id),
      api.invoices.list(session.accessToken, activeOrg.id),
      api.bills.list(session.accessToken, activeOrg.id),
    ]);
    setAccounts(acc);
    setTxns(tx.filter((t) => t.status !== 'RECONCILED'));
    setInvoices(inv.filter((i) => i.status === 'SENT'));
    setBills(bl.filter((b) => b.status === 'APPROVED'));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeOrg]);

  async function withAction(id: string, fn: () => Promise<unknown>) {
    setError(null);
    setActingId(id);
    try {
      await fn();
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not complete that action.');
    } finally {
      setActingId(null);
    }
  }

  const unmatchedCount = txns.filter((t) => t.status === 'UNMATCHED').length;
  const matchedCount = txns.filter((t) => t.status === 'MATCHED').length;

  return (
    <div>
      <h1 className="font-display text-2xl mb-1">Reconciliation</h1>
      <p className="text-sm text-ink/50 mb-6">
        Match bank transactions to invoices, bills and ledger entries, then mark them reconciled.
      </p>

      {accounts.length === 0 ? (
        <div className="rounded-lg border border-ink/10 bg-white p-6 text-sm text-ink/60">
          No bank accounts yet. Add one on the{' '}
          <Link to="/banking" className="text-ledger underline">
            Banking
          </Link>{' '}
          page before reconciling.
        </div>
      ) : (
        <>
          <div className="flex gap-4 mb-5">
            <div className="rounded-lg border border-ink/10 bg-white px-5 py-4 text-sm">
              <div className="text-ink/50 text-xs mb-1">Unmatched</div>
              <div className="font-display text-xl">{unmatchedCount}</div>
            </div>
            <div className="rounded-lg border border-ink/10 bg-white px-5 py-4 text-sm">
              <div className="text-ink/50 text-xs mb-1">Matched, not reconciled</div>
              <div className="font-display text-xl">{matchedCount}</div>
            </div>
          </div>

          {error && <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2 mb-4">{error}</p>}

          <div className="rounded-lg border border-ink/10 bg-white overflow-hidden">
            {loading ? (
              <p className="p-5 text-sm text-ink/50">Loading…</p>
            ) : txns.length === 0 ? (
              <p className="p-5 text-sm text-ink/50">Everything is reconciled. 🎉</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink/40 border-b border-ink/10">
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Description</th>
                    <th className="px-5 py-3 font-medium text-right">Amount</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((t) => {
                    const amount = parseFloat(t.amount);
                    return (
                      <tr key={t.id} className="border-b border-ink/5 last:border-b-0 align-top">
                        <td className="px-5 py-3 font-mono-num text-ink/60">{t.txn_date.slice(0, 10)}</td>
                        <td className="px-5 py-3">{t.description}</td>
                        <td className={`px-5 py-3 text-right font-mono-num ${amount > 0 ? 'text-ledger' : 'text-ink'}`}>
                          {money(t.amount)}
                        </td>
                        <td className="px-5 py-3">
                          <StatusPill status={t.status} />
                        </td>
                        <td className="px-5 py-3 text-right">
                          {t.status === 'UNMATCHED' && amount > 0 && (
                            <select
                              disabled={actingId === t.id}
                              onChange={(e) =>
                                e.target.value &&
                                withAction(t.id, () => api.bankTransactions.matchInvoice(session!.accessToken, activeOrg!.id, t.id, e.target.value))
                              }
                              className="text-xs border border-ink/15 rounded-md px-2 py-1"
                              defaultValue=""
                            >
                              <option value="" disabled>
                                Match invoice…
                              </option>
                              {invoices.map((inv) => (
                                <option key={inv.id} value={inv.id}>
                                  {inv.invoice_number} · {money(inv.total)}
                                </option>
                              ))}
                            </select>
                          )}
                          {t.status === 'UNMATCHED' && amount < 0 && (
                            <div className="flex gap-2 justify-end">
                              <select
                                disabled={actingId === t.id}
                                onChange={(e) =>
                                  e.target.value &&
                                  withAction(t.id, () => api.bankTransactions.matchBill(session!.accessToken, activeOrg!.id, t.id, e.target.value))
                                }
                                className="text-xs border border-ink/15 rounded-md px-2 py-1"
                                defaultValue=""
                              >
                                <option value="" disabled>
                                  Match bill…
                                </option>
                                {bills.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.bill_number} · {money(b.total)}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => withAction(t.id, () => api.bankTransactions.categorize(session!.accessToken, activeOrg!.id, t.id, '6-1000'))}
                                disabled={actingId === t.id}
                                className="text-xs text-ledger hover:underline"
                              >
                                Categorize as expense
                              </button>
                            </div>
                          )}
                          {t.status === 'MATCHED' && (
                            <button
                              onClick={() => withAction(t.id, () => api.bankTransactions.reconcile(session!.accessToken, activeOrg!.id, t.id))}
                              disabled={actingId === t.id}
                              className="text-xs text-ledger hover:underline"
                            >
                              Mark reconciled
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
