import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../context/SessionContext';
import { api } from '../lib/api';
import type { Contact, InvoiceSummary } from '../lib/api';
import { StatusPill } from '../components/StatusPill';
import { DocumentLineForm } from '../components/DocumentLineForm';
import { BulkBar } from '../components/BulkBar';

function money(v: string) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(parseFloat(v));
}

export function InvoicesPage() {
  const { session, activeOrg } = useSession();
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (statusFilter !== 'ALL' && inv.status !== statusFilter) return false;
      if (q && !inv.invoice_number.toLowerCase().includes(q) && !inv.status.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [invoices, query, statusFilter]);

  const allVisibleSelected = visible.length > 0 && visible.every((i) => selected.has(i.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allVisibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible.map((i) => i.id)));
    }
  }

  async function load() {
    if (!session || !activeOrg) return;
    setLoading(true);
    try {
      const [inv, ct] = await Promise.all([
        api.invoices.list(session.accessToken, activeOrg.id),
        api.contacts.list(session.accessToken, activeOrg.id),
      ]);
      setInvoices(inv);
      setContacts(ct.filter((c) => c.type === 'CUSTOMER' || c.type === 'BOTH'));
      setSelected(new Set());
    } catch {
      setInvoices([]);
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeOrg]);

  async function handleSend(id: string) {
    if (!session || !activeOrg) return;
    setSendingId(id);
    try {
      await api.invoices.send(session.accessToken, activeOrg.id, id);
      await load();
    } catch (err: any) {
      alert(err?.message || 'Could not send invoice');
    } finally {
      setSendingId(null);
    }
  }

  async function handleVoid(id: string) {
    if (!session || !activeOrg) return;
    if (!confirm('Void this invoice? A reversing journal entry will be posted.')) return;
    setSendingId(id);
    try {
      await api.invoices.void(session.accessToken, activeOrg.id, id, 'Voided by user');
      await load();
    } catch (err: any) {
      alert(err?.message || 'Could not void invoice');
    } finally {
      setSendingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!session || !activeOrg) return;
    if (!confirm('Delete this invoice? Only drafts and voided invoices can be deleted.')) return;
    setSendingId(id);
    try {
      await api.invoices.remove(session.accessToken, activeOrg.id, id);
      await load();
    } catch (err: any) {
      alert(err?.message || 'Could not delete invoice');
    } finally {
      setSendingId(null);
    }
  }

  async function handleCreditNote(id: string) {
    if (!session || !activeOrg) return;
    if (!confirm('Issue a credit note? This reverses the invoice and marks it void.')) return;
    setSendingId(id);
    try {
      await api.invoices.creditNote(session.accessToken, activeOrg.id, id, 'Credit note');
      await load();
    } catch (err: any) {
      alert(err?.message || 'Could not issue credit note');
    } finally {
      setSendingId(null);
    }
  }

  async function handleStripePay(id: string) {
    if (!session || !activeOrg) return;
    setSendingId(id);
    try {
      const origin = window.location.origin;
      const result = await api.payments.stripeCheckout(session.accessToken, activeOrg.id, {
        invoiceId: id,
        successUrl: `${origin}/invoices?paid=1`,
        cancelUrl: `${origin}/invoices?cancelled=1`,
      });
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (err: any) {
      alert(err?.message || 'Could not start Stripe Checkout');
    } finally {
      setSendingId(null);
    }
  }

  async function handleDuplicate(id: string) {
    if (!session || !activeOrg) return;
    setSendingId(id);
    try {
      await api.invoices.duplicate(session.accessToken, activeOrg.id, id);
      await load();
    } catch (err: any) {
      alert(err?.message || 'Could not copy invoice');
    } finally {
      setSendingId(null);
    }
  }

  async function bulkDelete() {
    if (!session || !activeOrg) return;
    const ids = [...selected];
    if (!confirm(`Delete ${ids.length} invoice(s)? Drafts and voided invoices are removed. Others are skipped.`)) return;
    try {
      const result = await api.invoices.bulkDelete(session.accessToken, activeOrg.id, ids);
      if (result.skipped.length) {
        alert(`${result.deleted.length} deleted. ${result.skipped.length} skipped (sent/paid — void them first).`);
      }
      await load();
    } catch (err: any) {
      alert(err?.message || 'Bulk delete failed');
    }
  }

  async function bulkVoid() {
    if (!session || !activeOrg) return;
    const ids = [...selected];
    if (!confirm(`Void ${ids.length} invoice(s)?`)) return;
    try {
      const result = await api.invoices.bulkVoid(session.accessToken, activeOrg.id, ids);
      if (result.skipped.length) {
        alert(`${result.voided.length} voided. ${result.skipped.length} skipped.`);
      }
      await load();
    } catch (err: any) {
      alert(err?.message || 'Bulk void failed');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl">Sales</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="bg-ledger text-white text-sm font-medium rounded-md px-4 py-2 hover:bg-ledger/90 transition-colors"
        >
          {showForm ? 'Cancel' : 'New invoice'}
        </button>
      </div>

      {showForm && (
        <div className="mb-6">
          <DocumentLineForm
            contacts={contacts}
            submitLabel="Save as draft"
            onSubmit={async (input) => {
              if (!session || !activeOrg) return;
              await api.invoices.create(session.accessToken, activeOrg.id, { ...input, currency: 'AUD' });
              setShowForm(false);
              await load();
            }}
          />
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search invoice number…"
          className="border border-ink/15 rounded-md px-3 py-2 text-sm min-w-[200px]"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-ink/15 rounded-md px-3 py-2 text-sm bg-white"
        >
          <option value="ALL">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="SENT">Awaiting payment</option>
          <option value="PAID">Paid</option>
          <option value="VOID">Voided</option>
        </select>
      </div>

      <BulkBar selected={selected.size} onClear={() => setSelected(new Set())}>
        <button type="button" onClick={bulkDelete} className="rounded-md bg-brick px-3 py-1.5 text-white text-xs font-medium">
          Delete
        </button>
        <button type="button" onClick={bulkVoid} className="rounded-md border border-ink/20 px-3 py-1.5 text-xs font-medium">
          Void
        </button>
      </BulkBar>

      <div className="rounded-lg border border-ink/10 bg-white overflow-hidden">
        {loading ? (
          <p className="p-5 text-sm text-ink/50">Loading…</p>
        ) : invoices.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-ink/50">No invoices yet.</p>
            <p className="text-xs text-ink/40 mt-1">Create a customer under Contacts, then raise your first sales invoice.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/40 border-b border-ink/10">
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all" />
                </th>
                <th className="px-5 py-3 font-medium">Number</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Total</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((inv) => (
                <tr key={inv.id} className={`border-b border-ink/5 last:border-b-0 ${selected.has(inv.id) ? 'bg-ledger/5' : ''}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(inv.id)}
                      onChange={() => toggle(inv.id)}
                      aria-label={`Select ${inv.invoice_number}`}
                    />
                  </td>
                  <td className="px-5 py-3 font-mono-num">{inv.invoice_number}</td>
                  <td className="px-5 py-3">
                    <StatusPill status={inv.status} />
                  </td>
                  <td className="px-5 py-3 text-right font-mono-num">
                    {money(inv.total)}
                    {inv.status === 'PARTIALLY_PAID' && (
                      <div className="text-xs text-amber font-normal">{money(inv.balance_remaining)} owing</div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    {inv.status === 'DRAFT' && (
                      <button
                        onClick={() => handleSend(inv.id)}
                        disabled={sendingId === inv.id}
                        className="text-ledger text-sm font-medium hover:underline disabled:opacity-50"
                      >
                        {sendingId === inv.id ? 'Sending…' : 'Send'}
                      </button>
                    )}
                    {(inv.status === 'SENT' || inv.status === 'OVERDUE' || inv.status === 'PARTIALLY_PAID') && (
                      <button
                        onClick={() => handleVoid(inv.id)}
                        disabled={sendingId === inv.id}
                        className="text-brick text-sm font-medium hover:underline disabled:opacity-50 ml-3"
                      >
                        Void
                      </button>
                    )}
                    {(inv.status === 'SENT' || inv.status === 'OVERDUE' || inv.status === 'PARTIALLY_PAID') && (
                      <button
                        onClick={() => handleStripePay(inv.id)}
                        disabled={sendingId === inv.id}
                        className="text-ledger text-sm font-medium hover:underline disabled:opacity-50 ml-3"
                      >
                        {sendingId === inv.id ? '…' : 'Pay'}
                      </button>
                    )}
                    {(inv.status === 'SENT' || inv.status === 'OVERDUE' || inv.status === 'PARTIALLY_PAID' || inv.status === 'PAID') && (
                      <button
                        onClick={() => handleCreditNote(inv.id)}
                        disabled={sendingId === inv.id}
                        className="text-amber text-sm font-medium hover:underline disabled:opacity-50 ml-3"
                      >
                        Credit note
                      </button>
                    )}
                    <button
                      onClick={() => handleDuplicate(inv.id)}
                      disabled={sendingId === inv.id}
                      className="text-ink/60 text-sm font-medium hover:underline disabled:opacity-50 ml-3"
                    >
                      Copy
                    </button>
                    {(inv.status === 'DRAFT' || inv.status === 'VOID') && (
                      <button
                        onClick={() => handleDelete(inv.id)}
                        disabled={sendingId === inv.id}
                        className="text-brick text-sm font-medium hover:underline disabled:opacity-50 ml-3"
                      >
                        Delete
                      </button>
                    )}
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
