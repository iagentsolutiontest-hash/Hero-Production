import type { ComponentType } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SessionProvider } from './context/SessionContext';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { ContactsPage } from './pages/ContactsPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { BillsPage } from './pages/BillsPage';
import { BankingPage } from './pages/BankingPage';
import { ReportsPage } from './pages/ReportsPage';
import { ChartOfAccountsPage } from './pages/ChartOfAccountsPage';
import { JournalsPage } from './pages/JournalsPage';
import { SettingsPage } from './pages/SettingsPage';
import { PayrollPage } from './pages/PayrollPage';
import { ModulePage } from './pages/ModulePage';
import { ReconciliationPage } from './pages/ReconciliationPage';
import { ReconciliationHistoryPage } from './pages/ReconciliationHistoryPage';
import { InventoryValuationPage } from './pages/InventoryValuationPage';
import { DepreciationPage } from './pages/DepreciationPage';
import { AssetDisposalsPage } from './pages/AssetDisposalsPage';
import { CashFlowPage } from './pages/CashFlowPage';
import { BudgetVsActualPage } from './pages/BudgetVsActualPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AskHeroPage } from './pages/AskHeroPage';

// Routes with a dedicated, purpose-built page (real computed reports / reused APIs).
const dedicated: Record<string, ComponentType> = {
  '/reconciliation': ReconciliationPage,
  '/reconciliation-history': ReconciliationHistoryPage,
  '/inventory-valuation': InventoryValuationPage,
  '/depreciation': DepreciationPage,
  '/asset-disposals': AssetDisposalsPage,
  '/cash-flow': CashFlowPage,
  '/budget-vs-actual': BudgetVsActualPage,
  '/analytics': AnalyticsPage,
  '/ai': AskHeroPage,
};

// Everything else runs through the generic, backend-wired CRUD page (see ModulePage's CONFIGS).
const genericModules = [
  '/quotes', '/recurring-invoices', '/credit-notes', '/customer-payments', '/purchase-orders',
  '/recurring-bills', '/supplier-payments', '/bank-rules', '/opening-balances', '/accounting-periods',
  '/expenses', '/expense-claims', '/receipts', '/reimbursements', '/products', '/inventory',
  '/stock-adjustments', '/fixed-assets', '/projects', '/time-tracking', '/project-costs',
  '/project-budgets', '/files',
];

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/bills" element={<BillsPage />} />
            <Route path="/banking" element={<BankingPage />} />
            <Route path="/accounts" element={<ChartOfAccountsPage />} />
            <Route path="/journals" element={<JournalsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/payroll" element={<PayrollPage />} />
            {Object.entries(dedicated).map(([path, Component]) => (
              <Route key={path} path={path} element={<Component />} />
            ))}
            {genericModules.map((path) => (
              <Route key={path} path={path} element={<ModulePage />} />
            ))}
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
