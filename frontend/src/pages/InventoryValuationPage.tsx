import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { api } from '../lib/api';
import type { OpsRecord } from '../lib/api';

function money(v: string) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(parseFloat(v));
}

export function InventoryValuationPage() {
  const { session, activeOrg } = useSession();
  const [rows, setRows] = useState<OpsRecord[]>([]);
  const [totalValue, setTotalValue] = useState('0.00');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !activeOrg) return;
    setLoading(true);
    api.ops
      .inventoryValuation(session.accessToken, activeOrg.id)
      .then((data) => {
        setRows(data.rows);
        setTotalValue(data.totalValue);
      })
      .catch((err) => setError(err?.message || 'Could not load inventory valuation.'))
      .finally(() => setLoading(false));
  }, [session, activeOrg]);

  return (
    <div>
      <h1 className="font-display text-2xl mb-1">Inventory valuation</h1>
      <p className="text-sm text-ink/50 mb-6">Current stock quantity × cost price for every active product.</p>

      <div className="rounded-lg border border-ink/10 bg-white px-5 py-4 text-sm mb-5 inline-block">
        <div className="text-ink/50 text-xs mb-1">Total inventory value</div>
        <div className="font-display text-xl">{money(totalValue)}</div>
      </div>

      {error && <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2 mb-4">{error}</p>}

      <div className="rounded-lg border border-ink/10 bg-white overflow-hidden">
        {loading ? (
          <p className="p-5 text-sm text-ink/50">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm text-ink/50">
            No active products yet. Add some on the <Link to="/products" className="text-ledger underline">Products</Link> page.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/40 border-b border-ink/10">
                <th className="px-5 py-3 font-medium">SKU</th>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium text-right">Qty on hand</th>
                <th className="px-5 py-3 font-medium text-right">Cost price</th>
                <th className="px-5 py-3 font-medium text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-ink/5 last:border-b-0">
                  <td className="px-5 py-3 font-mono-num text-ink/60">{r.sku}</td>
                  <td className="px-5 py-3">{r.name}</td>
                  <td className="px-5 py-3 text-right font-mono-num">{parseFloat(r.quantity_on_hand)}</td>
                  <td className="px-5 py-3 text-right font-mono-num">{money(r.purchase_price)}</td>
                  <td className="px-5 py-3 text-right font-mono-num font-medium">{money(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
