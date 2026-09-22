import { useEffect, useState } from 'react';
import { useSession } from '../context/SessionContext';
import { api } from '../lib/api';

function money(v: string | number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(parseFloat(String(v)));
}

export function CashFlowPage() {
  const { session, activeOrg } = useSession();
  const [months, setMonths] = useState(6);
  const [inflows, setInflows] = useState<{ month: string; expected: string }[]>([]);
  const [outflows, setOutflows] = useState<{ month: string; expected: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !activeOrg) return;
    setLoading(true);
    api.ops
      .cashFlow(session.accessToken, activeOrg.id, months)
      .then((data) => {
        setInflows(data.inflows);
        setOutflows(data.outflows);
      })
      .catch((err) => setError(err?.message || 'Could not load cash-flow forecast.'))
      .finally(() => setLoading(false));
  }, [session, activeOrg, months]);

  const allMonths = Array.from(new Set([...inflows.map((i) => i.month), ...outflows.map((o) => o.month)])).sort();

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl mb-1">Cash-flow forecast</h1>
          <p className="text-sm text-ink/50">
            Expected inflows from open invoices and expected outflows from approved bills, by due month.
          </p>
        </div>
        <select
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          className="border border-ink/15 rounded-md px-3 py-2 text-sm"
        >
          {[3, 6, 12].map((m) => (
            <option key={m} value={m}>
              Next {m} months
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2 mb-4">{error}</p>}

      <div className="rounded-lg border border-ink/10 bg-white overflow-hidden">
        {loading ? (
          <p className="p-5 text-sm text-ink/50">Loading…</p>
        ) : allMonths.length === 0 ? (
          <p className="p-5 text-sm text-ink/50">No open invoices or bills due in this window.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/40 border-b border-ink/10">
                <th className="px-5 py-3 font-medium">Month</th>
                <th className="px-5 py-3 font-medium text-right">Expected inflow</th>
                <th className="px-5 py-3 font-medium text-right">Expected outflow</th>
                <th className="px-5 py-3 font-medium text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {allMonths.map((m) => {
                const inflow = parseFloat(inflows.find((i) => i.month === m)?.expected || '0');
                const outflow = parseFloat(outflows.find((o) => o.month === m)?.expected || '0');
                return (
                  <tr key={m} className="border-b border-ink/5 last:border-b-0">
                    <td className="px-5 py-3 font-medium">{m}</td>
                    <td className="px-5 py-3 text-right font-mono-num text-ledger">{money(inflow)}</td>
                    <td className="px-5 py-3 text-right font-mono-num text-brick">{money(outflow)}</td>
                    <td className={`px-5 py-3 text-right font-mono-num font-medium ${inflow - outflow >= 0 ? 'text-ledger' : 'text-brick'}`}>
                      {money(inflow - outflow)}
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
