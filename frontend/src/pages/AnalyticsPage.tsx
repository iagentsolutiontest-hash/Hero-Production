import { useEffect, useState } from 'react';
import { useSession } from '../context/SessionContext';
import { api } from '../lib/api';

function money(v: string | number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(parseFloat(String(v)));
}

interface Analytics {
  contactCount: number;
  invoicesByStatus: { status: string; n: string; total: string }[];
  billsByStatus: { status: string; n: string; total: string }[];
  accountsReceivable: string;
  accountsPayable: string;
}

export function AnalyticsPage() {
  const { session, activeOrg } = useSession();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !activeOrg) return;
    setLoading(true);
    api.ops
      .analytics(session.accessToken, activeOrg.id)
      .then(setData)
      .catch((err) => setError(err?.message || 'Could not load analytics.'))
      .finally(() => setLoading(false));
  }, [session, activeOrg]);

  return (
    <div>
      <h1 className="font-display text-2xl mb-1">Analytics</h1>
      <p className="text-sm text-ink/50 mb-6">Management insights computed from your live contacts, invoices and bills.</p>

      {error && <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2 mb-4">{error}</p>}

      {loading ? (
        <p className="text-sm text-ink/50">Loading…</p>
      ) : data ? (
        <>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="rounded-lg border border-ink/10 bg-white px-5 py-4">
              <div className="text-ink/50 text-xs mb-1">Contacts</div>
              <div className="font-display text-xl">{data.contactCount}</div>
            </div>
            <div className="rounded-lg border border-ink/10 bg-white px-5 py-4">
              <div className="text-ink/50 text-xs mb-1">Accounts receivable</div>
              <div className="font-display text-xl text-ledger">{money(data.accountsReceivable)}</div>
            </div>
            <div className="rounded-lg border border-ink/10 bg-white px-5 py-4">
              <div className="text-ink/50 text-xs mb-1">Accounts payable</div>
              <div className="font-display text-xl text-brick">{money(data.accountsPayable)}</div>
            </div>
            <div className="rounded-lg border border-ink/10 bg-white px-5 py-4">
              <div className="text-ink/50 text-xs mb-1">Net position</div>
              <div className="font-display text-xl">{money(parseFloat(data.accountsReceivable) - parseFloat(data.accountsPayable))}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="rounded-lg border border-ink/10 bg-white overflow-hidden">
              <h2 className="text-sm font-medium px-5 pt-4 pb-2">Invoices by status</h2>
              {data.invoicesByStatus.length === 0 ? (
                <p className="p-5 text-sm text-ink/50">No invoices yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {data.invoicesByStatus.map((s) => (
                      <tr key={s.status} className="border-t border-ink/5">
                        <td className="px-5 py-2.5">{s.status}</td>
                        <td className="px-5 py-2.5 text-right text-ink/50">{s.n}</td>
                        <td className="px-5 py-2.5 text-right font-mono-num">{money(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="rounded-lg border border-ink/10 bg-white overflow-hidden">
              <h2 className="text-sm font-medium px-5 pt-4 pb-2">Bills by status</h2>
              {data.billsByStatus.length === 0 ? (
                <p className="p-5 text-sm text-ink/50">No bills yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {data.billsByStatus.map((s) => (
                      <tr key={s.status} className="border-t border-ink/5">
                        <td className="px-5 py-2.5">{s.status}</td>
                        <td className="px-5 py-2.5 text-right text-ink/50">{s.n}</td>
                        <td className="px-5 py-2.5 text-right font-mono-num">{money(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
