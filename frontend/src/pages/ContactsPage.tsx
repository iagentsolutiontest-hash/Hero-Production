import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useSession } from '../context/SessionContext';
import { api, ApiError } from '../lib/api';
import type { Contact } from '../lib/api';
import { StatementPanel } from '../components/StatementPanel';
import { BulkBar } from '../components/BulkBar';

export function ContactsPage() {
  const { session, activeOrg } = useSession();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statementContactId, setStatementContactId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q),
    );
  }, [contacts, query]);

  const allVisibleSelected = visible.length > 0 && visible.every((c) => selected.has(c.id));

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
    const list = await api.contacts.list(session.accessToken, activeOrg.id);
    setContacts(list);
    setSelected(new Set());
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeOrg]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!session || !activeOrg) return;
    setError(null);
    const form = e.target as HTMLFormElement;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value;
    const type = (form.elements.namedItem('type') as HTMLSelectElement).value;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value || undefined;
    try {
      await api.contacts.create(session.accessToken, activeOrg.id, { type, name, email });
      form.reset();
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create contact.');
    }
  }

  async function handleDelete(id: string) {
    if (!session || !activeOrg) return;
    if (!confirm('Delete this contact? Contacts with invoices or bills cannot be deleted.')) return;
    try {
      await api.contacts.remove(session.accessToken, activeOrg.id, id);
      await load();
    } catch (err: any) {
      alert(err?.message || 'Could not delete contact');
    }
  }

  async function bulkDelete() {
    if (!session || !activeOrg) return;
    const ids = [...selected];
    if (!confirm(`Delete ${ids.length} contact(s)? Contacts with documents are skipped.`)) return;
    try {
      const result = await api.contacts.bulkDelete(session.accessToken, activeOrg.id, ids);
      if (result.skipped.length) {
        alert(`${result.deleted.length} deleted. ${result.skipped.length} skipped (have invoices/bills).`);
      }
      await load();
    } catch (err: any) {
      alert(err?.message || 'Bulk delete failed');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl">Contacts</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="bg-ledger text-white text-sm font-medium rounded-md px-4 py-2 hover:bg-ledger/90 transition-colors"
        >
          {showForm ? 'Cancel' : 'New contact'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-lg border border-ink/10 bg-white p-5 mb-6 grid grid-cols-3 gap-3 items-end">
          <div>
            <label className="text-xs text-ink/60 mb-1 block">Name</label>
            <input name="name" required className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-ink/60 mb-1 block">Type</label>
            <select name="type" className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm bg-white">
              <option value="CUSTOMER">Customer</option>
              <option value="SUPPLIER">Supplier</option>
              <option value="BOTH">Both</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-ink/60 mb-1 block">Email (optional)</label>
            <input name="email" type="email" className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="col-span-3">
            {error && <p className="text-sm text-brick mb-2">{error}</p>}
            <button type="submit" className="bg-ink text-white text-sm rounded-md px-4 py-2">
              Save contact
            </button>
          </div>
        </form>
      )}

      {statementContactId && (
        <StatementPanel contactId={statementContactId} onClose={() => setStatementContactId(null)} />
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search contacts…"
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
        ) : contacts.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-ink/50">No contacts yet.</p>
            <p className="text-xs text-ink/40 mt-1">Add customers and suppliers to raise invoices and record bills.</p>
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
                      setSelected(allVisibleSelected ? new Set() : new Set(visible.map((c) => c.id)))
                    }
                    aria-label="Select all"
                  />
                </th>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} className={`border-b border-ink/5 last:border-b-0 ${selected.has(c.id) ? 'bg-ledger/5' : ''}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      aria-label={`Select ${c.name}`}
                    />
                  </td>
                  <td className="px-5 py-3">{c.name}</td>
                  <td className="px-5 py-3 text-ink/60">{c.type}</td>
                  <td className="px-5 py-3 text-ink/60">{c.email || '—'}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => setStatementContactId(c.id)}
                      className="text-ledger text-sm font-medium hover:underline"
                    >
                      Statement
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-brick text-sm font-medium hover:underline ml-3"
                    >
                      Delete
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
