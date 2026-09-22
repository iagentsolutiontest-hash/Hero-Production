export function BulkBar({
  selected,
  onClear,
  children,
}: {
  selected: number;
  onClear: () => void;
  children: React.ReactNode;
}) {
  if (selected === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-ledger/30 bg-ledger/5 px-3 py-2 text-sm">
      <span className="font-medium text-ink">{selected} selected</span>
      {children}
      <button type="button" onClick={onClear} className="ml-auto text-xs text-ink/50 hover:underline">
        Clear
      </button>
    </div>
  );
}
