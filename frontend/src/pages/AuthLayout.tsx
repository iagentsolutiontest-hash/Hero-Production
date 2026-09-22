import type { ReactNode } from 'react';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <div className="hidden md:flex w-1/2 bg-ink text-paper flex-col justify-between p-12 ledger-rules">
        <div>
          <span className="font-display text-2xl tracking-tight">Hero</span>
          <div className="text-xs text-paper/50 mt-0.5">Accounting</div>
        </div>
        <div>
          <p className="font-display text-3xl leading-snug max-w-sm">
            Every dollar has two sides. Hero keeps them balanced.
          </p>
          <p className="text-paper/50 text-sm mt-4 max-w-sm">
            Professional double-entry accounting for small and medium
            businesses — invoicing, banking, reconciliation, and financial
            reports driven by the ledger.
          </p>
        </div>
        <span className="text-paper/40 text-xs">Secure · Multi-tenant · Audit-ready</span>
      </div>
      <div className="flex-1 flex items-center justify-center bg-paper p-8">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
