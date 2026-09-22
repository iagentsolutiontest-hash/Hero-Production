import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../context/SessionContext';
import { api } from '../lib/api';
import type { Contact, BillSummary } from '../lib/api';
import { StatusPill } from '../components/StatusPill';
import { DocumentLineForm } from '../components/DocumentLineForm';
import { BulkBar } from '../components/BulkBar';

function money(v: string) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(parseFloat(v));
}

const NEXT_ACTION: Record<string, { label: string; action: keyof typeof api.bills } | undefined> = {
  DRAFT: { label: 'Submit', action: 'submit' },
  SUBMITTED: { label: 'Approve', action: 'approve' },
  APPROVED: { label: 'Mark paid', action: 'pay' },
  PARTIALLY_PAID: { label: 'Mark fully paid', action: 'pay' },
};

export function BillsPage() {
  const { session, activeOrg } = useSession();
  const [bills, setBills] = useState<BillSummary[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bills;
    return bills.filter((b) => b.bill_number.toLowerCase().includes(q) || b.status.toLowerCase().includes(q));
  }, [bills, query]);

  const allVisibleSelected = visible.length > 0 && visible.every((b) => selected.has(b.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function load() {
    if (!session || !activeOrg) return;
    setLoading(true);
    try {
      const [bl, ct] = await Promise.all([
        api.bills.list(session.accessToken, activeOrg.id),
        api.contacts.list(session.accessToken, activeOrg.id),
      ]);
      setBills(bl);
      setContacts(ct.filter((c) => c.type === 'SUPPLIER' || c.type === 'BOTH'));
      setSelected(new Set());
    } catch {
      setBills([]);
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeOrg]);

  async function handleAction(billId: string, status: string) {
    if (!session || !activeOrg) return;
    const next = NEXT_ACTION[status];
    if (!next) return;
    setActingId(billId);
    try {
      const fn = api.bills[next.action] as (token: string, orgId: string, id: string) => Promise<unknown>;
      await fn(session.accessToken, activeOrg.id, billId);
      await load();
    } catch (err: any) {
      alert(err?.message || 'Action failed');
    } finally {
      setActingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!session || !activeOrg) return;
    if (!confirm('Delete this bill? Only draft/submitted bills can be deleted.')) return;
    setActingId(id);
    try {
      await api.bills.remove(session.accessToken, activeOrg.id, id);
      await load();
    } catch (err: any) {
      alert(err?.message || 'Could not delete bill');
    } finally {
      setActingId(null);
    }
  }

  async function bulkDelete() {
    if (!session || !activeOrg) return;
    const ids = [...selected];
    if (!confirm(`Delete ${ids.length} bill(s)? Approved/paid bills are skipped.`)) return;
    try {
      const result = await api.bills.bulkDelete(session.accessToken, activeOrg.id, ids);
      if (result.skipped.length) {
        alert(`${result.deleted.length} deleted. ${result.skipped.length} skipped.`);
      }
      await load();
    } catch (err: any) {
      alert(err?.message || 'Bulk delete failed');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl">Purchases</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="bg-ledger text-white text-sm font-medium rounded-md px-4 py-2 hover:bg-ledger/90 transition-colors"
        >
          {showForm ? 'Cancel' : 'New bill'}
        </button>
      </div>

      {showForm && (
        <div className="mb-6">
          <DocumentLineForm
            contacts={contacts}
            submitLabel="Save as draft"
            onSubmit={async (input) => {
              if (!session || !activeOrg) return;
              await api.bills.create(session.accessToken, activeOrg.id, { ...input, currency: 'AUD' });
              setShowForm(false);
              await load();
            }}
          />
        </div>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search bills…"
        className="mb-3 border border-ink/15 rounded-md px-3 py-2 text-sm min-w-[200px]"
      />

      <BulkBar selected={selected.size} onClear={() => setSelected(new Set())}>
        <button type="button" onClick={bulkDelete} className="rounded-md bg-brick px-3 py-1.5 text-white text-xs font-medium">
          Delete
        </button>
      </BulkBar>

      <div className="rounded-lg border border-ink/10 bg-white overflow-hidden">
        {loading ? (
          <p className="p-5 text-sm text-ink/50">Loading…</p>
        ) : bills.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-ink/50">No bills yet.</p>
            <p className="text-xs text-ink/40 mt-1">Add a supplier under Contacts, then record a purchase bill.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/40 border-b border-ink/10">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={() =>
                      setSelected(allVisibleSelected ? new Set() : new Set(visible.map((b) => b.id)))
                    }
                    aria-label="Select all"
                  />
                </th>
                <th className="px-5 py-3 font-medium">Number</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Total</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((bill) => {
                const next = NEXT_ACTION[bill.status];
                return (
                  <tr key={bill.id} className={`border-b border-ink/5 last:border-b-0 ${selected.has(bill.id) ? 'bg-ledger/5' : ''}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(bill.id)}
                        onChange={() => toggle(bill.id)}
                        aria-label={`Select ${bill.bill_number}`}
                      />
                    </td>
                    <td className="px-5 py-3 font-mono-num">{bill.bill_number}</td>
                    <td className="px-5 py-3">
                      <StatusPill status={bill.status} />
                    </td>
                    <td className="px-5 py-3 text-right font-mono-num">
                      {money(bill.total)}
                      {bill.status === 'PARTIALLY_PAID' && (
                        <div className="text-xs text-amber font-normal">{money(bill.balance_remaining)} owing</div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {next && (
                        <button
                          onClick={() => handleAction(bill.id, bill.status)}
                          disabled={actingId === bill.id}
                          className="text-ledger text-sm font-medium hover:underline disabled:opacity-50"
                        >
                          {actingId === bill.id ? 'Working…' : next.label}
                        </button>
                      )}
                      {(bill.status === 'DRAFT' || bill.status === 'SUBMITTED') && (
                        <button
                          onClick={() => handleDelete(bill.id)}
                          disabled={actingId === bill.id}
                          className="text-brick text-sm font-medium hover:underline disabled:opacity-50 ml-3"
                        >
                          Delete
                        </button>
                      )}
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
