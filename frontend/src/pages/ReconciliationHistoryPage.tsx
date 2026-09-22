import { useEffect, useState } from 'react';
import { useSession } from '../context/SessionContext';
import { api } from '../lib/api';
import type { BankAccount, BankTransaction } from '../lib/api';
import { StatusPill } from '../components/StatusPill';

function money(v: string) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(parseFloat(v));
}

export function ReconciliationHistoryPage() {
  const { session, activeOrg } = useSession();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [txns, setTxns] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session || !activeOrg) return;
    setLoading(true);
    Promise.all([
      api.bankAccounts.list(session.accessToken, activeOrg.id),
      api.bankTransactions.list(session.accessToken, activeOrg.id),
    ]).then(([acc, tx]) => {
      setAccounts(acc);
      setTxns(tx.filter((t) => t.status === 'RECONCILED'));
      setLoading(false);
    });
  }, [session, activeOrg]);

  const total = txns.reduce((sum, t) => sum + parseFloat(t.amount), 0);

  return (
    <div>
      <h1 className="font-display text-2xl mb-1">Reconciliation history</h1>
      <p className="text-sm text-ink/50 mb-6">Bank transactions that have been reconciled.</p>

      <div className="rounded-lg border border-ink/10 bg-white px-5 py-4 text-sm mb-5 inline-block">
        <div className="text-ink/50 text-xs mb-1">Total reconciled</div>
        <div className="font-display text-xl">{money(total.toFixed(2))}</div>
      </div>

      <div className="rounded-lg border border-ink/10 bg-white overflow-hidden">
        {loading ? (
          <p className="p-5 text-sm text-ink/50">Loading…</p>
        ) : accounts.length === 0 ? (
          <p className="p-5 text-sm text-ink/50">No bank accounts yet.</p>
        ) : txns.length === 0 ? (
          <p className="p-5 text-sm text-ink/50">Nothing reconciled yet — see the Reconciliation page.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/40 border-b border-ink/10">
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Description</th>
                <th className="px-5 py-3 font-medium text-right">Amount</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id} className="border-b border-ink/5 last:border-b-0">
                  <td className="px-5 py-3 font-mono-num text-ink/60">{t.txn_date.slice(0, 10)}</td>
                  <td className="px-5 py-3">{t.description}</td>
                  <td className="px-5 py-3 text-right font-mono-num">{money(t.amount)}</td>
                  <td className="px-5 py-3">
                    <StatusPill status={t.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
