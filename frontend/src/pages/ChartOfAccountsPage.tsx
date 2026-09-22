import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useSession } from '../context/SessionContext';
import { api, ApiError } from '../lib/api';
import type { Account } from '../lib/api';

const ACCOUNT_TYPES = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'COST_OF_GOODS_SOLD',
  'EXPENSE',
] as const;

const TYPE_LABELS: Record<string, string> = {
  ASSET: 'Assets',
  LIABILITY: 'Liabilities',
  EQUITY: 'Equity',
  REVENUE: 'Revenue',
  COST_OF_GOODS_SOLD: 'Cost of Goods Sold',
  EXPENSE: 'Expenses',
};

export function ChartOfAccountsPage() {
  const { session, activeOrg } = useSession();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!session || !activeOrg) return;
    setLoading(true);
    try {
      const data = await api.ledger.listAccounts(session.accessToken, activeOrg.id);
      setAccounts(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeOrg]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!session || !activeOrg) return;
    setError(null);
    setSaving(true);
    const form = e.target as HTMLFormElement;
    const code = (form.elements.namedItem('code') as HTMLInputElement).value;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value;
    const type = (form.elements.namedItem('type') as HTMLSelectElement).value;
    try {
      await api.ledger.createAccount(session.accessToken, activeOrg.id, { code, name, type });
      setShowForm(false);
      form.reset();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create account');
    } finally {
      setSaving(false);
    }
  }

  const grouped = ACCOUNT_TYPES.map((type) => ({
    type,
    label: TYPE_LABELS[type],
    items: accounts.filter((a) => a.type === type),
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl">Chart of Accounts</h1>
          <p className="text-sm text-ink/50 mt-1">
            The foundation of your ledger. Balances are calculated from journal postings.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="bg-ledger text-white text-sm font-medium rounded-md px-4 py-2 hover:bg-ledger/90 transition-colors"
        >
          {showForm ? 'Cancel' : 'Add account'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-lg border border-ink/10 bg-white p-5 space-y-3 max-w-lg"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ink/60 mb-1 block">Code</label>
              <input
                name="code"
                required
                placeholder="e.g. 6-1900"
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ledger/40 font-mono-num"
              />
            </div>
            <div>
              <label className="text-xs text-ink/60 mb-1 block">Type</label>
              <select
                name="type"
                required
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ledger/40"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-ink/60 mb-1 block">Name</label>
            <input
              name="name"
              required
              placeholder="Account name"
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ledger/40"
            />
          </div>
          {error && (
            <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="bg-ledger text-white text-sm font-medium rounded-md px-4 py-2 hover:bg-ledger/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Create account'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-ink/50">Loading accounts…</p>
      ) : accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink/15 bg-white p-10 text-center">
          <p className="text-sm text-ink/50">No accounts yet. Create an organization to seed the standard chart.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={group.type} className="rounded-lg border border-ink/10 bg-white overflow-hidden">
              <div className="px-5 py-3 bg-paper-dim border-b border-ink/10">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                  {group.label}
                </h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink/40 border-b border-ink/10">
                    <th className="px-5 py-2.5 font-medium w-28">Code</th>
                    <th className="px-5 py-2.5 font-medium">Name</th>
                    <th className="px-5 py-2.5 font-medium w-24">System</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((acc) => (
                    <tr key={acc.id} className="border-b border-ink/5 last:border-b-0">
                      <td className="px-5 py-2.5 font-mono-num text-ink/70">{acc.code}</td>
                      <td className="px-5 py-2.5">{acc.name}</td>
                      <td className="px-5 py-2.5 text-ink/40 text-xs">
                        {acc.is_system ? 'Yes' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
