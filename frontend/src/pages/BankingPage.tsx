import { useEffect, useState, type ChangeEvent } from 'react';
import { useSession } from '../context/SessionContext';
import { api } from '../lib/api';
import type { BankAccount, BankTransaction, InvoiceSummary, BillSummary } from '../lib/api';
import { StatusPill } from '../components/StatusPill';

function money(v: string) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(parseFloat(v));
}

export function BankingPage() {
  const { session, activeOrg } = useSession();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [txns, setTxns] = useState<BankTransaction[]>([]);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [bills, setBills] = useState<BillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAccountName, setNewAccountName] = useState('');
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
    setTxns(tx);
    setInvoices(inv.filter((i) => i.status === 'SENT'));
    setBills(bl.filter((b) => b.status === 'APPROVED'));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeOrg]);

  async function handleCreateAccount() {
    if (!session || !activeOrg || !newAccountName.trim()) return;
    await api.bankAccounts.create(session.accessToken, activeOrg.id, newAccountName.trim());
    setNewAccountName('');
    await load();
  }

  async function handleSeedDemoTransactions() {
    if (!session || !activeOrg || accounts.length === 0) return;
    await api.bankAccounts.importTransactions(session.accessToken, activeOrg.id, accounts[0].id, [
      { date: new Date().toISOString().slice(0, 10), description: 'Bank fee', amount: '-15.00' },
    ]);
    await load();
  }

  async function handleMatchInvoice(txnId: string, invoiceId: string) {
    if (!session || !activeOrg) return;
    setError(null);
    setActingId(txnId);
    try {
      await api.bankTransactions.matchInvoice(session.accessToken, activeOrg.id, txnId, invoiceId);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not match.');
    } finally {
      setActingId(null);
    }
  }

  async function handleMatchBill(txnId: string, billId: string) {
    if (!session || !activeOrg) return;
    setError(null);
    setActingId(txnId);
    try {
      await api.bankTransactions.matchBill(session.accessToken, activeOrg.id, txnId, billId);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not match.');
    } finally {
      setActingId(null);
    }
  }

  async function handleCategorize(txnId: string) {
    if (!session || !activeOrg) return;
    setActingId(txnId);
    try {
      await api.bankTransactions.categorize(session.accessToken, activeOrg.id, txnId, '6-1000');
      await load();
    } finally {
      setActingId(null);
    }
  }

  async function handleReconcile(txnId: string) {
    if (!session || !activeOrg) return;
    setActingId(txnId);
    try {
      await api.bankTransactions.reconcile(session.accessToken, activeOrg.id, txnId);
      await load();
    } finally {
      setActingId(null);
    }
  }

  async function handleFileImport(e: ChangeEvent<HTMLInputElement>) {
    if (!session || !activeOrg || accounts.length === 0) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setActingId('import');
    try {
      const content = await file.text();
      const name = file.name.toLowerCase();
      const format: 'csv' | 'ofx' = name.endsWith('.ofx') || name.endsWith('.qfx') ? 'ofx' : 'csv';
      const result = await api.bankAccounts.importFile(
        session.accessToken,
        activeOrg.id,
        accounts[0].id,
        content,
        format,
      );
      if (result.parseErrorCount > 0) {
        setError(`Imported ${result.imported} rows. ${result.parseErrorCount} row(s) skipped.`);
      }
      await load();
    } catch (err: any) {
      setError(err?.message || 'Import failed');
    } finally {
      setActingId(null);
      e.target.value = '';
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl mb-6">Banking</h1>

      <div className="rounded-lg border border-ink/10 bg-white p-5 mb-6">
        <h2 className="text-sm font-medium mb-3">Bank accounts</h2>
        {accounts.length === 0 ? (
          <p className="text-sm text-ink/50 mb-3">No bank accounts yet. Create one to import transactions and reconcile.</p>
        ) : (
          <ul className="text-sm mb-3 space-y-1">
            {accounts.map((a) => (
              <li key={a.id} className="flex justify-between">
                <span>{a.name}</span>
                <span className="font-mono-num text-ink/50">{a.gl_account_code}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            value={newAccountName}
            onChange={(e) => setNewAccountName(e.target.value)}
            placeholder="e.g. Everyday Business Account"
            className="border border-ink/15 rounded-md px-3 py-2 text-sm flex-1"
          />
          <button
            onClick={handleCreateAccount}
            className="bg-ink text-white text-sm rounded-md px-4 py-2"
          >
            Add account
          </button>
          {accounts.length > 0 && (
            <button
              onClick={handleSeedDemoTransactions}
              className="border border-ink/15 text-sm rounded-md px-4 py-2 text-ink/70"
            >
              Demo txn
            </button>
          )}
        </div>
        {accounts.length > 0 && (
          <div className="mt-4 pt-4 border-t border-ink/10">
            <label className="text-xs text-ink/60 mb-2 block">
              Import bank statement (CSV or OFX)
            </label>
            <input
              type="file"
              accept=".csv,.ofx,.qfx,text/csv,application/x-ofx"
              onChange={handleFileImport}
              className="text-sm text-ink/70 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-ledger file:text-white file:text-sm file:font-medium file:cursor-pointer"
            />
            <p className="text-xs text-ink/40 mt-2">
              CSV needs Date, Description, and Amount (or Debit/Credit) columns. OFX bank exports are also supported.
            </p>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2 mb-4">{error}</p>}

      <div className="rounded-lg border border-ink/10 bg-white overflow-hidden">
        <h2 className="text-sm font-medium px-5 pt-4 pb-2">Transactions</h2>
        {loading ? (
          <p className="p-5 text-sm text-ink/50">Loading…</p>
        ) : txns.length === 0 ? (
          <p className="p-5 text-sm text-ink/50">No transactions yet.</p>
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
                          onChange={(e) => e.target.value && handleMatchInvoice(t.id, e.target.value)}
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
                            onChange={(e) => e.target.value && handleMatchBill(t.id, e.target.value)}
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
                            onClick={() => handleCategorize(t.id)}
                            disabled={actingId === t.id}
                            className="text-xs text-ledger hover:underline"
                          >
                            Categorize as expense
                          </button>
                        </div>
                      )}
                      {t.status === 'MATCHED' && (
                        <button
                          onClick={() => handleReconcile(t.id)}
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
    </div>
  );
}
