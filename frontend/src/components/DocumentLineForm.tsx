import { useEffect, useState } from 'react';
import type { Contact, InvoiceLineInput } from '../lib/api';
import { api } from '../lib/api';
import { useSession } from '../context/SessionContext';

export interface LineDraft {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRateCode: string;
}

type TaxRate = { code: string; label: string; rate: string };

export function DocumentLineForm({
  contacts,
  submitLabel,
  onSubmit,
}: {
  contacts: Contact[];
  submitLabel: string;
  onSubmit: (input: {
    contactId: string;
    issueDate: string;
    dueDate: string;
    lines: InvoiceLineInput[];
  }) => Promise<void>;
}) {
  const { session, activeOrg } = useSession();
  const [taxRates, setTaxRates] = useState<TaxRate[]>([
    { code: 'GST_STANDARD', label: 'GST 10%', rate: '0.10' },
  ]);
  const [currency, setCurrency] = useState('AUD');

  const emptyLine = (): LineDraft => ({
    description: '',
    quantity: '1',
    unitPrice: '',
    taxRateCode: taxRates[0]?.code || 'GST_STANDARD',
  });

  const [contactId, setContactId] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() =>
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
  );
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!session || !activeOrg) return;
    api.countries
      .taxRates(session.accessToken, activeOrg.id)
      .then((data) => {
        setTaxRates(data.taxRates);
        setCurrency(data.defaultCurrency);
        setLines((prev) =>
          prev.map((l) => ({
            ...l,
            taxRateCode: data.taxRates.some((r) => r.code === l.taxRateCode)
              ? l.taxRateCode
              : data.taxRates[0]?.code || l.taxRateCode,
          })),
        );
      })
      .catch(() => {
        /* keep AU defaults */
      });
  }, [session, activeOrg]);

  function updateLine(idx: number, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function rateFor(code: string): number {
    const r = taxRates.find((t) => t.code === code);
    return r ? parseFloat(r.rate) : 0;
  }

  const netTotal = lines.reduce(
    (sum, l) => sum + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0),
    0,
  );
  const taxTotal = lines.reduce(
    (sum, l) =>
      sum + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0) * rateFor(l.taxRateCode),
    0,
  );

  async function handleSubmit() {
    setError(null);
    if (!contactId) {
      setError('Choose a contact.');
      return;
    }
    const validLines = lines.filter(
      (l) => l.description.trim() && parseFloat(l.quantity) > 0 && l.unitPrice !== '',
    );
    if (validLines.length === 0) {
      setError('Add at least one line with description, quantity and unit price.');
      return;
    }
    if (new Date(dueDate) < new Date(issueDate)) {
      setError('Due date cannot be before the issue date.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ contactId, issueDate, dueDate, lines: validLines });
    } catch (err: any) {
      setError(err?.message || 'Could not save.');
    } finally {
      setSubmitting(false);
    }
  }

  const moneyFmt = (n: number) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);

  return (
    <div className="rounded-lg border border-ink/10 bg-white p-5 space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-ink/60 mb-1 block">Contact</label>
          <select
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="">Select…</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-ink/60 mb-1 block">Issue date</label>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm bg-white"
          />
        </div>
        <div>
          <label className="text-xs text-ink/60 mb-1 block">Due date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm bg-white"
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-ink/50">
          Line amounts are tax-exclusive. Tax rates follow this organization&apos;s country ({currency}).
        </p>
        {lines.map((line, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 items-center">
            <input
              placeholder="Description"
              value={line.description}
              onChange={(e) => updateLine(idx, { description: e.target.value })}
              className="col-span-5 border border-ink/15 rounded-md px-3 py-2 text-sm"
            />
            <input
              placeholder="Qty"
              value={line.quantity}
              onChange={(e) => updateLine(idx, { quantity: e.target.value })}
              className="col-span-2 border border-ink/15 rounded-md px-3 py-2 text-sm font-mono-num"
            />
            <input
              placeholder="Unit price"
              value={line.unitPrice}
              onChange={(e) => updateLine(idx, { unitPrice: e.target.value })}
              className="col-span-2 border border-ink/15 rounded-md px-3 py-2 text-sm font-mono-num"
            />
            <select
              value={line.taxRateCode}
              onChange={(e) => updateLine(idx, { taxRateCode: e.target.value })}
              className="col-span-2 border border-ink/15 rounded-md px-3 py-2 text-sm bg-white"
            >
              {taxRates.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}
              className="col-span-1 text-ink/40 hover:text-brick text-sm"
              disabled={lines.length === 1}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLines((ls) => [...ls, emptyLine()])}
          className="text-sm text-ledger hover:underline"
        >
          + Add line
        </button>
      </div>

      <div className="flex justify-end text-sm font-mono-num text-ink/70 gap-6 border-t border-ink/10 pt-3">
        <span>Subtotal: {moneyFmt(netTotal)}</span>
        <span>Tax: {moneyFmt(taxTotal)}</span>
        <span className="font-medium text-ink">Total: {moneyFmt(netTotal + taxTotal)}</span>
      </div>

      {error && <p className="text-sm text-brick">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="bg-ink text-white text-sm rounded-md px-4 py-2 disabled:opacity-50"
      >
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </div>
  );
}
