import { useEffect, useState } from 'react';
import { useSession } from '../context/SessionContext';
import { api } from '../lib/api';
import type { OpsRecord } from '../lib/api';

function money(v: string | number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(parseFloat(String(v)));
}

export function AssetDisposalsPage() {
  const { session, activeOrg } = useSession();
  const [active, setActive] = useState<OpsRecord[]>([]);
  const [disposed, setDisposed] = useState<OpsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disposingId, setDisposingId] = useState<string | null>(null);
  const [form, setForm] = useState({ disposalDate: new Date().toISOString().slice(0, 10), proceeds: '', reason: '' });

  async function load() {
    if (!session || !activeOrg) return;
    setLoading(true);
    try {
      const [a, d] = await Promise.all([
        api.ops.list(session.accessToken, activeOrg.id, 'fixed-assets', { status: 'ACTIVE' }),
        api.ops.list(session.accessToken, activeOrg.id, 'fixed-assets', { status: 'DISPOSED' }),
      ]);
      setActive(a);
      setDisposed(d);
    } catch (err: any) {
      setError(err?.message || 'Could not load fixed assets.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeOrg]);

  async function dispose(id: string) {
    if (!session || !activeOrg) return;
    setDisposingId(id);
    setError(null);
    try {
      await api.ops.disposeAsset(session.accessToken, activeOrg.id, id, form);
      setForm({ disposalDate: new Date().toISOString().slice(0, 10), proceeds: '', reason: '' });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not dispose this asset.');
    } finally {
      setDisposingId(null);
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl mb-1">Asset disposals</h1>
      <p className="text-sm text-ink/50 mb-6">Record assets sold, scrapped or retired.</p>

      {error && <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2 mb-4">{error}</p>}

      <div className="rounded-lg border border-ink/10 bg-white p-5 mb-6">
        <h2 className="text-sm font-medium mb-3">Disposal details (applied to whichever asset you dispose below)</h2>
        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs text-ink/60">
            Disposal date
            <input
              type="date"
              value={form.disposalDate}
              onChange={(e) => setForm((f) => ({ ...f, disposalDate: e.target.value }))}
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm mt-1"
            />
          </label>
          <label className="text-xs text-ink/60">
            Proceeds
            <input
              value={form.proceeds}
              onChange={(e) => setForm((f) => ({ ...f, proceeds: e.target.value }))}
              placeholder="0.00"
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm mt-1"
            />
          </label>
          <label className="text-xs text-ink/60">
            Reason
            <input
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Sold, scrapped, retired…"
              className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm mt-1"
            />
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-ink/10 bg-white overflow-hidden mb-6">
        <h2 className="text-sm font-medium px-5 pt-4 pb-2">Active assets</h2>
        {loading ? (
          <p className="p-5 text-sm text-ink/50">Loading…</p>
        ) : active.length === 0 ? (
          <p className="p-5 text-sm text-ink/50">No active assets.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/40 border-b border-ink/10">
                <th className="px-5 py-3 font-medium">Asset</th>
                <th className="px-5 py-3 font-medium text-right">Cost</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {active.map((a) => (
                <tr key={a.id} className="border-b border-ink/5 last:border-b-0">
                  <td className="px-5 py-3">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-ink/40">{a.asset_code}</div>
                  </td>
                  <td className="px-5 py-3 text-right font-mono-num">{money(a.cost)}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => dispose(a.id)}
                      disabled={disposingId === a.id}
                      className="text-xs bg-brick text-white rounded-md px-3 py-1.5 font-medium disabled:opacity-50"
                    >
                      {disposingId === a.id ? 'Disposing…' : 'Dispose'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-lg border border-ink/10 bg-white overflow-hidden">
        <h2 className="text-sm font-medium px-5 pt-4 pb-2">Disposal history</h2>
        {disposed.length === 0 ? (
          <p className="p-5 text-sm text-ink/50">Nothing disposed yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/40 border-b border-ink/10">
                <th className="px-5 py-3 font-medium">Asset</th>
                <th className="px-5 py-3 font-medium">Disposal date</th>
                <th className="px-5 py-3 font-medium text-right">Proceeds</th>
                <th className="px-5 py-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {disposed.map((a) => (
                <tr key={a.id} className="border-b border-ink/5 last:border-b-0">
                  <td className="px-5 py-3">{a.name}</td>
                  <td className="px-5 py-3 font-mono-num text-ink/60">{a.data?.disposal?.date || '—'}</td>
                  <td className="px-5 py-3 text-right font-mono-num">{a.data?.disposal?.proceeds ? money(a.data.disposal.proceeds) : '—'}</td>
                  <td className="px-5 py-3">{a.data?.disposal?.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
