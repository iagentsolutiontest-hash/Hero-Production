const STYLES: Record<string, string> = {
  DRAFT: 'bg-ink/5 text-ink/60',
  SENT: 'bg-ledger-soft text-ledger',
  SUBMITTED: 'bg-ledger-soft text-ledger',
  APPROVED: 'bg-amber-soft text-amber',
  PARTIALLY_PAID: 'bg-amber-soft text-amber',
  PAID: 'bg-ledger text-white',
  OVERDUE: 'bg-brick-soft text-brick',
  VOID: 'bg-ink/5 text-ink/40 line-through',
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${STYLES[status] || 'bg-ink/5 text-ink/60'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}
