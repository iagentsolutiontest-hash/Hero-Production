import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useSession } from '../context/SessionContext';
import { ApiError } from '../lib/api';

/**
 * Payroll UI — scaffold only.
 * Backend uses a flat 20% placeholder withholding. Not for real payroll.
 */

type Employee = {
  id: string;
  full_name: string;
  email: string | null;
  annual_salary: string | null;
  pay_frequency: string;
  is_active: boolean;
};

type Payslip = {
  id: string;
  employee_name: string;
  period_start: string;
  period_end: string;
  gross_pay: string;
  tax_withheld: string;
  net_pay: string;
  status: string;
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:3000' : '')).replace(/\/$/, '');

if (!API_BASE) {
  throw new Error('VITE_API_BASE_URL is required in production.');
}

async function payrollFetch<T>(
  path: string,
  accessToken: string,
  organizationId: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'x-organization-id': organizationId,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new ApiError(res.status, json?.error?.code || 'ERROR', json?.error?.message || 'Request failed');
  }
  return json.data as T;
}

export function PayrollPage() {
  const { session, activeOrg } = useSession();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [salary, setSalary] = useState('');

  async function load() {
    if (!session || !activeOrg) return;
    try {
      const [e, p] = await Promise.all([
        payrollFetch<Employee[]>('/api/v1/payroll/employees', session.accessToken, activeOrg.id),
        payrollFetch<Payslip[]>('/api/v1/payroll/payslips', session.accessToken, activeOrg.id),
      ]);
      setEmployees(e);
      setPayslips(p);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Payroll requires org.manage permission and migration 0004 applied');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeOrg]);

  async function handleAddEmployee(e: FormEvent) {
    e.preventDefault();
    if (!session || !activeOrg) return;
    try {
      await payrollFetch('/api/v1/payroll/employees', session.accessToken, activeOrg.id, {
        method: 'POST',
        body: { fullName: name, annualSalary: salary || undefined },
      });
      setName('');
      setSalary('');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not create employee');
    }
  }

  async function handleDraftPayslip(employeeId: string) {
    if (!session || !activeOrg) return;
    const gross = prompt('Gross pay for this period?', '5000');
    if (!gross) return;
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    try {
      await payrollFetch('/api/v1/payroll/payslips', session.accessToken, activeOrg.id, {
        method: 'POST',
        body: {
          employeeId,
          periodStart: start.toISOString().slice(0, 10),
          periodEnd: end.toISOString().slice(0, 10),
          grossPay: gross,
        },
      });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not create payslip');
    }
  }

  async function handlePost(payslipId: string) {
    if (!session || !activeOrg) return;
    if (!confirm('Post payslip to the ledger? (Placeholder tax — not for live payroll)')) return;
    try {
      await payrollFetch(`/api/v1/payroll/payslips/${payslipId}/post`, session.accessToken, activeOrg.id, {
        method: 'POST',
      });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not post payslip');
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl">Payroll</h1>
        <p className="text-sm text-amber mt-1 bg-amber-soft rounded-md px-3 py-2 inline-block">
          Scaffold only — tax withholding is a flat 20% placeholder. Not statutory. Do not use for real employee payments.
        </p>
      </div>

      {error && <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2 mb-4">{error}</p>}

      <form onSubmit={handleAddEmployee} className="rounded-lg border border-ink/10 bg-white p-5 mb-6 max-w-lg flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-xs text-ink/60 block mb-1">Employee name</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm" />
        </div>
        <div className="w-36">
          <label className="text-xs text-ink/60 block mb-1">Annual salary</label>
          <input value={salary} onChange={(e) => setSalary(e.target.value)} className="w-full border border-ink/15 rounded-md px-3 py-2 text-sm font-mono-num" />
        </div>
        <button type="submit" className="bg-ledger text-white text-sm rounded-md px-4 py-2">Add</button>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-ink/10 bg-white overflow-hidden">
          <h2 className="text-sm font-medium px-5 pt-4 pb-2">Employees</h2>
          {employees.length === 0 ? (
            <p className="p-5 text-sm text-ink/50">No employees yet.</p>
          ) : (
            <ul className="text-sm divide-y divide-ink/5">
              {employees.map((e) => (
                <li key={e.id} className="px-5 py-3 flex justify-between items-center">
                  <span>{e.full_name}</span>
                  <button onClick={() => handleDraftPayslip(e.id)} className="text-ledger text-xs font-medium hover:underline">
                    Draft payslip
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-ink/10 bg-white overflow-hidden">
          <h2 className="text-sm font-medium px-5 pt-4 pb-2">Payslips</h2>
          {payslips.length === 0 ? (
            <p className="p-5 text-sm text-ink/50">No payslips yet.</p>
          ) : (
            <ul className="text-sm divide-y divide-ink/5">
              {payslips.map((p) => (
                <li key={p.id} className="px-5 py-3 flex justify-between items-center">
                  <div>
                    <div>{p.employee_name}</div>
                    <div className="text-xs text-ink/50">
                      {p.period_start?.slice?.(0, 10) || p.period_start} → net {p.net_pay}
                    </div>
                  </div>
                  {p.status === 'DRAFT' ? (
                    <button onClick={() => handlePost(p.id)} className="text-ledger text-xs font-medium hover:underline">
                      Post
                    </button>
                  ) : (
                    <span className="text-xs text-ink/40">{p.status}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
