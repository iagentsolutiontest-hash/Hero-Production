import { useEffect, useState } from 'react';
import { useSession } from '../context/SessionContext';
import { api } from '../lib/api';
import type { TrialBalanceRow, ProfitAndLoss, BalanceSheet } from '../lib/api';

function money(v: string) {
  const n = parseFloat(v);
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n || 0);
}

const TABS = ['Profit & Loss', 'Balance Sheet', 'Trial Balance', 'GST Summary'] as const;

type GstSummary = {
  fromDate: string;
  toDate: string;
  gstCollectedOnSales: string;
  gstCreditsOnPurchases: string;
  netGstPayable: string;
  disclaimer: string;
};

export function ReportsPage() {
  const { session, activeOrg } = useSession();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Profit & Loss');
  const [from, setFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pnl, setPnl] = useState<ProfitAndLoss | null>(null);
  const [bs, setBs] = useState<BalanceSheet | null>(null);
  const [tb, setTb] = useState<TrialBalanceRow[] | null>(null);
  const [gst, setGst] = useState<GstSummary | null>(null);

  useEffect(() => {
    if (!session || !activeOrg) return;
    setLoading(true);
    setError(null);
    const run = async () => {
      try {
        if (tab === 'Profit & Loss') {
          setPnl(await api.reports.profitAndLoss(session.accessToken, activeOrg.id, from, to));
        } else if (tab === 'Balance Sheet') {
          setBs(await api.reports.balanceSheet(session.accessToken, activeOrg.id, asOf));
        } else if (tab === 'Trial Balance') {
          setTb(await api.reports.trialBalance(session.accessToken, activeOrg.id));
        } else if (tab === 'GST Summary') {
          setGst(await api.reports.gstSummary(session.accessToken, activeOrg.id, from, to));
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load report');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [session, activeOrg, tab, from, to, asOf]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl">Financial reports</h1>
        <p className="text-sm text-ink/50 mt-0.5">
          Generated from the General Ledger — balances always derive from postings.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-sm rounded-md px-3 py-1.5 transition-colors ${
              tab === t
                ? 'bg-ledger text-white'
                : 'bg-white border border-ink/10 text-ink/70 hover:bg-paper-dim'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-6 text-sm items-end">
        {(tab === 'Profit & Loss' || tab === 'GST Summary') && (
          <>
            <div>
              <label className="text-xs text-ink/50 block mb-1">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="border border-ink/15 rounded-md px-2 py-1.5 bg-white"
              />
            </div>
            <div>
              <label className="text-xs text-ink/50 block mb-1">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="border border-ink/15 rounded-md px-2 py-1.5 bg-white"
              />
            </div>
          </>
        )}
        {tab === 'Balance Sheet' && (
          <div>
            <label className="text-xs text-ink/50 block mb-1">As of</label>
            <input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              className="border border-ink/15 rounded-md px-2 py-1.5 bg-white"
            />
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2 mb-4">{error}</p>
      )}

      {tab === 'Profit & Loss' && (
        <div>
          {loading || !pnl ? (
            <p className="text-sm text-ink/50">Loading…</p>
          ) : (
            <div className="rounded-lg border border-ink/10 bg-white p-6 max-w-lg space-y-1">
              <Section title="Revenue">
                {pnl.lines
                  .filter((l) => l.type === 'REVENUE')
                  .map((r) => (
                    <Row key={r.code} label={`${r.code} ${r.name}`} value={r.amount} />
                  ))}
                <Row label="Total revenue" value={pnl.totals.revenue} bold />
              </Section>
              <Section title="Cost of goods sold">
                {pnl.lines
                  .filter((l) => l.type === 'COST_OF_GOODS_SOLD')
                  .map((r) => (
                    <Row key={r.code} label={`${r.code} ${r.name}`} value={r.amount} />
                  ))}
                <Row label="Total COGS" value={pnl.totals.costOfGoodsSold} bold />
                <Row label="Gross profit" value={pnl.totals.grossProfit} bold />
              </Section>
              <Section title="Expenses">
                {pnl.lines
                  .filter((l) => l.type === 'EXPENSE')
                  .map((r) => (
                    <Row key={r.code} label={`${r.code} ${r.name}`} value={r.amount} />
                  ))}
                <Row label="Total expenses" value={pnl.totals.expenses} bold />
              </Section>
              <div className="border-t border-ink/10 mt-2 pt-2">
                <Row label="Net profit" value={pnl.totals.netProfit} bold accent />
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'Balance Sheet' && (
        <div>
          {loading || !bs ? (
            <p className="text-sm text-ink/50">Loading…</p>
          ) : (
            <div className="rounded-lg border border-ink/10 bg-white p-6 max-w-lg space-y-1">
              <Section title="Assets">
                {bs.lines
                  .filter((l) => l.type === 'ASSET')
                  .map((r) => (
                    <Row key={r.code} label={`${r.code} ${r.name}`} value={r.amount} />
                  ))}
                <Row label="Total assets" value={bs.totals.assets} bold />
              </Section>
              <Section title="Liabilities">
                {bs.lines
                  .filter((l) => l.type === 'LIABILITY')
                  .map((r) => (
                    <Row key={r.code} label={`${r.code} ${r.name}`} value={r.amount} />
                  ))}
                <Row label="Total liabilities" value={bs.totals.liabilities} bold />
              </Section>
              <Section title="Equity">
                {bs.lines
                  .filter((l) => l.type === 'EQUITY')
                  .map((r) => (
                    <Row key={r.code} label={`${r.code} ${r.name}`} value={r.amount} />
                  ))}
                <Row label="Explicit equity" value={bs.totals.explicitEquity} />
                <Row label="Retained earnings (derived)" value={bs.totals.derivedEquityPlug} />
              </Section>
              {bs.totals.note && (
                <p className="text-xs text-ink/40 mt-3 pt-3 border-t border-ink/10">{bs.totals.note}</p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'Trial Balance' && (
        <div className="rounded-lg border border-ink/10 bg-white overflow-hidden">
          {loading || !tb ? (
            <p className="p-5 text-sm text-ink/50">Loading…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink/40 border-b border-ink/10">
                  <th className="px-5 py-3 font-medium">Code</th>
                  <th className="px-5 py-3 font-medium">Account</th>
                  <th className="px-5 py-3 font-medium text-right">Debit</th>
                  <th className="px-5 py-3 font-medium text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {tb.map((row) => (
                  <tr key={row.account_code} className="border-b border-ink/5 last:border-b-0">
                    <td className="px-5 py-3 font-mono-num text-ink/50">{row.account_code}</td>
                    <td className="px-5 py-3">{row.account_name}</td>
                    <td className="px-5 py-3 text-right font-mono-num">{money(row.debit)}</td>
                    <td className="px-5 py-3 text-right font-mono-num">{money(row.credit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'GST Summary' && (
        <div>
          {loading || !gst ? (
            <p className="text-sm text-ink/50">Loading…</p>
          ) : (
            <div className="rounded-lg border border-ink/10 bg-white p-6 max-w-lg space-y-1">
              <Row label="GST collected on sales" value={gst.gstCollectedOnSales} />
              <Row label="GST credits on purchases" value={gst.gstCreditsOnPurchases} />
              <div className="border-t border-ink/10 mt-2 pt-2">
                <Row label="Net GST payable" value={gst.netGstPayable} bold accent />
              </div>
              <p className="text-xs text-ink/40 mt-4">{gst.disclaimer}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="text-xs uppercase tracking-wide text-ink/40 mb-1">{title}</p>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={`flex justify-between py-1.5 text-sm ${bold ? 'font-medium' : ''}`}>
      <span className="text-ink/70">{label}</span>
      <span className={`font-mono-num ${accent ? 'text-ledger' : ''}`}>{money(value)}</span>
    </div>
  );
}
