import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { api } from '../lib/api';
import type { OpsRecord } from '../lib/api';

function money(v: string | number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(parseFloat(String(v)));
}

export function DepreciationPage() {
  const { session, activeOrg } = useSession();
  const [assets, setAssets] = useState<OpsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  async function load() {
    if (!session || !activeOrg) return;
    setLoading(true);
    try {
      const data = await api.ops.list(session.accessToken, activeOrg.id, 'fixed-assets', { status: 'ACTIVE' });
      setAssets(data);
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

  function monthlyEstimate(a: OpsRecord) {
    const base = Math.max(parseFloat(a.cost) - parseFloat(a.residual_value), 0);
    return base / (Number(a.useful_life_months) || 1);
  }

  async function runDepreciation(id: string) {
    if (!session || !activeOrg) return;
    setActingId(id);
    setError(null);
    setLastResult(null);
    try {
      const result = await api.ops.runDepreciation(session.accessToken, activeOrg.id, id);
      setLastResult(result.message || `Posted ${money(result.amountPosted)} of depreciation.`);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not run depreciation.');
    } finally {
      setActingId(null);
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl mb-1">Depreciation</h1>
      <p className="text-sm text-ink/50 mb-6">
        Straight-line depreciation for active fixed assets, capped at cost minus residual value.
      </p>

      {error && <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2 mb-4">{error}</p>}
      {lastResult && <p className="text-sm text-ledger bg-ledger-soft rounded-md px-3 py-2 mb-4">{lastResult}</p>}

      <div className="rounded-lg border border-ink/10 bg-white overflow-hidden">
        {loading ? (
          <p className="p-5 text-sm text-ink/50">Loading…</p>
        ) : assets.length === 0 ? (
          <p className="p-5 text-sm text-ink/50">
            No active fixed assets. Add some on the <Link to="/fixed-assets" className="text-ledger underline">Fixed assets</Link> page.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/40 border-b border-ink/10">
                <th className="px-5 py-3 font-medium">Asset</th>
                <th className="px-5 py-3 font-medium text-right">Cost</th>
                <th className="px-5 py-3 font-medium text-right">Accumulated</th>
                <th className="px-5 py-3 font-medium text-right">Est. monthly</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id} className="border-b border-ink/5 last:border-b-0">
                  <td className="px-5 py-3">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-ink/40">{a.asset_code}</div>
                  </td>
                  <td className="px-5 py-3 text-right font-mono-num">{money(a.cost)}</td>
                  <td className="px-5 py-3 text-right font-mono-num">{money(a.accumulated_depreciation)}</td>
                  <td className="px-5 py-3 text-right font-mono-num">{money(monthlyEstimate(a))}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => runDepreciation(a.id)}
                      disabled={actingId === a.id}
                      className="text-xs bg-ledger text-white rounded-md px-3 py-1.5 font-medium disabled:opacity-50"
                    >
                      {actingId === a.id ? 'Running…' : 'Run depreciation'}
                    </button>
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
