import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useSession } from '../context/SessionContext';
import { api, ApiError } from '../lib/api';
import type { Account, JournalSummary } from '../lib/api';

function money(v: string) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(parseFloat(v || '0'));
}

interface LineDraft {
  accountCode: string;
  debit: string;
  credit: string;
  memo: string;
}

const emptyLine = (): LineDraft => ({ accountCode: '', debit: '', credit: '', memo: '' });

export function JournalsPage() {
  const { session, activeOrg } = useSession();
  const [journals, setJournals] = useState<JournalSummary[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(), emptyLine()]);
  const [description, setDescription] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));

  async function load() {
    if (!session || !activeOrg) return;
    setLoading(true);
    try {
      const [j, a] = await Promise.all([
        api.ledger.listJournals(session.accessToken, activeOrg.id),
        api.ledger.listAccounts(session.accessToken, activeOrg.id),
      ]);
      setJournals(j);
      setAccounts(a);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeOrg]);

  function updateLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(idx: number) {
    setLines((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== idx)));
  }

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session || !activeOrg || !balanced) return;
    setError(null);
    setSaving(true);
    try {
      await api.ledger.postJournal(session.accessToken, activeOrg.id, {
        entryDate,
        description,
        lines: lines
          .filter((l) => l.accountCode && (l.debit || l.credit))
          .map((l) => ({
            accountCode: l.accountCode,
            debit: l.debit || undefined,
            credit: l.credit || undefined,
            memo: l.memo || undefined,
          })),
      });
      setShowForm(false);
      setDescription('');
      setLines([emptyLine(), emptyLine()]);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to post journal');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl">Journal Entries</h1>
          <p className="text-sm text-ink/50 mt-1">
            Double-entry postings. Every entry must balance before it can be posted.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="bg-ledger text-white text-sm font-medium rounded-md px-4 py-2 hover:bg-ledger/90 transition-colors"
        >
          {showForm ? 'Cancel' : 'New journal entry'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-lg border border-ink/10 bg-white p-5 space-y-4"
        >
          <div className="grid grid-cols-2 gap-3 max-w-xl">
            <div>
              <label className="text-xs text-ink/60 mb-1 block">Date</label>
              <input
                type="date"
                required
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ledger/40"
              />
            </div>
            <div>
              <label className="text-xs text-ink/60 mb-1 block">Description</label>
              <input
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Depreciation for August"
                className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ledger/40"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink/40 border-b border-ink/10">
                  <th className="py-2 pr-2 font-medium">Account</th>
                  <th className="py-2 pr-2 font-medium w-32 text-right">Debit</th>
                  <th className="py-2 pr-2 font-medium w-32 text-right">Credit</th>
                  <th className="py-2 pr-2 font-medium">Memo</th>
                  <th className="py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx} className="border-b border-ink/5">
                    <td className="py-2 pr-2">
                      <select
                        required
                        value={line.accountCode}
                        onChange={(e) => updateLine(idx, { accountCode: e.target.value })}
                        className="w-full border border-ink/15 rounded-md px-2 py-1.5 text-sm bg-white"
                      >
                        <option value="">Select account…</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.code}>
                            {a.code} — {a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.debit}
                        onChange={(e) => updateLine(idx, { debit: e.target.value, credit: '' })}
                        className="w-full border border-ink/15 rounded-md px-2 py-1.5 text-sm text-right font-mono-num bg-white"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.credit}
                        onChange={(e) => updateLine(idx, { credit: e.target.value, debit: '' })}
                        className="w-full border border-ink/15 rounded-md px-2 py-1.5 text-sm text-right font-mono-num bg-white"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        value={line.memo}
                        onChange={(e) => updateLine(idx, { memo: e.target.value })}
                        className="w-full border border-ink/15 rounded-md px-2 py-1.5 text-sm bg-white"
                      />
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="text-ink/30 hover:text-brick text-xs"
                        title="Remove line"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink/10">
                  <td className="py-2 pr-2">
                    <button
                      type="button"
                      onClick={addLine}
                      className="text-ledger text-xs font-medium hover:underline"
                    >
                      + Add line
                    </button>
                  </td>
                  <td className="py-2 pr-2 text-right font-mono-num font-medium">
                    {money(String(totalDebit))}
                  </td>
                  <td className="py-2 pr-2 text-right font-mono-num font-medium">
                    {money(String(totalCredit))}
                  </td>
                  <td colSpan={2} className="py-2 text-xs text-ink/50">
                    {balanced ? (
                      <span className="text-ledger">Balanced ✓</span>
                    ) : (
                      <span className="text-amber">Out of balance by {money(String(Math.abs(totalDebit - totalCredit)))}</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {error && (
            <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving || !balanced}
            className="bg-ledger text-white text-sm font-medium rounded-md px-4 py-2 hover:bg-ledger/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Posting…' : 'Post journal entry'}
          </button>
        </form>
      )}

      <div className="rounded-lg border border-ink/10 bg-white overflow-hidden">
        {loading ? (
          <p className="p-5 text-sm text-ink/50">Loading journals…</p>
        ) : journals.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-ink/50">No journal entries yet.</p>
            <p className="text-xs text-ink/40 mt-1">
              Entries are created automatically when you send invoices, approve bills, or match bank transactions.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/40 border-b border-ink/10">
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Description</th>
                <th className="px-5 py-3 font-medium">Source</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {journals.map((j) => (
                <tr key={j.id} className="border-b border-ink/5 last:border-b-0">
                  <td className="px-5 py-3 font-mono-num text-ink/70">
                    {j.entry_date?.slice(0, 10)}
                  </td>
                  <td className="px-5 py-3">{j.description}</td>
                  <td className="px-5 py-3">
                    <span className="text-xs uppercase tracking-wide text-ink/50 bg-paper-dim rounded px-1.5 py-0.5">
                      {j.source_type}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-ink/50">{j.status}</td>
                  <td className="px-5 py-3 text-right font-mono-num">{money(j.total_debit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
