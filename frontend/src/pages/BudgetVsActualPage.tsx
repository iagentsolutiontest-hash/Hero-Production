import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { api } from '../lib/api';

function money(v: string | number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(parseFloat(String(v)));
}

export function BudgetVsActualPage() {
  const { session, activeOrg } = useSession();
  const [rows, setRows] = useState<{ project_id: string; code: string; name: string; budgeted: string; actual: string; variance: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !activeOrg) return;
    setLoading(true);
    api.ops
      .budgetVsActual(session.accessToken, activeOrg.id)
      .then(setRows)
      .catch((err) => setError(err?.message || 'Could not load budget vs actual.'))
      .finally(() => setLoading(false));
  }, [session, activeOrg]);

  return (
    <div>
      <h1 className="font-display text-2xl mb-1">Budget vs actual</h1>
      <p className="text-sm text-ink/50 mb-6">
        Budgeted amounts from Project budgets compared against actual spend from Project costs.
      </p>

      {error && <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2 mb-4">{error}</p>}

      <div className="rounded-lg border border-ink/10 bg-white overflow-hidden">
        {loading ? (
          <p className="p-5 text-sm text-ink/50">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm text-ink/50">
            No projects yet. Add some on the <Link to="/projects" className="text-ledger underline">Projects</Link> page.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/40 border-b border-ink/10">
                <th className="px-5 py-3 font-medium">Project</th>
                <th className="px-5 py-3 font-medium text-right">Budgeted</th>
                <th className="px-5 py-3 font-medium text-right">Actual</th>
                <th className="px-5 py-3 font-medium text-right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const variance = parseFloat(r.variance);
                return (
                  <tr key={r.project_id} className="border-b border-ink/5 last:border-b-0">
                    <td className="px-5 py-3">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-ink/40">{r.code}</div>
                    </td>
                    <td className="px-5 py-3 text-right font-mono-num">{money(r.budgeted)}</td>
                    <td className="px-5 py-3 text-right font-mono-num">{money(r.actual)}</td>
                    <td className={`px-5 py-3 text-right font-mono-num font-medium ${variance >= 0 ? 'text-ledger' : 'text-brick'}`}>
                      {money(variance)}
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
