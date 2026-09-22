import { useEffect, useState } from 'react';
import { useSession } from '../context/SessionContext';
import { api } from '../lib/api';
import type { ContactStatement } from '../lib/api';
import { StatusPill } from './StatusPill';

function money(v: string) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(parseFloat(v));
}

export function StatementPanel({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const { session, activeOrg } = useSession();
  const [statement, setStatement] = useState<ContactStatement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session || !activeOrg) return;
    setLoading(true);
    api.contacts.statement(session.accessToken, activeOrg.id, contactId).then((s) => {
      setStatement(s);
      setLoading(false);
    });
  }, [session, activeOrg, contactId]);

  return (
    <div className="rounded-lg border border-ink/10 bg-white p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg">
          Statement {statement ? `— ${statement.contact.name}` : ''}
        </h2>
        <button onClick={onClose} className="text-sm text-ink/50 hover:text-ink">
          Close
        </button>
      </div>

      {loading || !statement ? (
        <p className="text-sm text-ink/50">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="rounded-md bg-ledger-soft px-4 py-3">
              <div className="text-xs text-ink/50 uppercase tracking-wide">Owes you</div>
              <div className="font-mono-num text-lg text-ledger">{money(statement.totals.totalReceivable)}</div>
            </div>
            <div className="rounded-md bg-amber-soft px-4 py-3">
              <div className="text-xs text-ink/50 uppercase tracking-wide">You owe them</div>
              <div className="font-mono-num text-lg text-amber">{money(statement.totals.totalPayable)}</div>
            </div>
          </div>

          {statement.invoices.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-medium mb-2">Invoices</h3>
              <table className="w-full text-sm">
                <tbody>
                  {statement.invoices.map((inv) => (
                    <tr key={inv.id} className="border-t border-ink/5 first:border-t-0">
                      <td className="py-2 font-mono-num text-ink/70">{inv.invoice_number}</td>
                      <td className="py-2">
                        <StatusPill status={inv.status} />
                      </td>
                      <td className="py-2 text-right font-mono-num text-ink/50">{money(inv.total)}</td>
                      <td className="py-2 text-right font-mono-num font-medium">{money(inv.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {statement.bills.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">Bills</h3>
              <table className="w-full text-sm">
                <tbody>
                  {statement.bills.map((bill) => (
                    <tr key={bill.id} className="border-t border-ink/5 first:border-t-0">
                      <td className="py-2 font-mono-num text-ink/70">{bill.bill_number}</td>
                      <td className="py-2">
                        <StatusPill status={bill.status} />
                      </td>
                      <td className="py-2 text-right font-mono-num text-ink/50">{money(bill.total)}</td>
                      <td className="py-2 text-right font-mono-num font-medium">{money(bill.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {statement.invoices.length === 0 && statement.bills.length === 0 && (
            <p className="text-sm text-ink/40">No invoices or bills for this contact yet.</p>
          )}
        </>
      )}
    </div>
  );
}
