import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

type IconName = 'grid'|'chart'|'spark'|'invoice'|'quote'|'repeat'|'credit'|'payment'|'bill'|'bank'|'swap'|'history'|'accounts'|'journal'|'calendar'|'report'|'expense'|'check'|'receipt'|'inventory'|'asset'|'project'|'clock'|'contacts'|'payroll'|'folder'|'settings'|'help'|'bell'|'search'|'plus'|'chevron'|'menu'|'logout';
type Item = { to: string; label: string; icon: IconName; end?: boolean };
type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  { title: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: 'grid', end: true }, { to: '/analytics', label: 'Analytics', icon: 'chart' }, { to: '/ai', label: 'Ask Hero AI', icon: 'spark' }] },
  { title: 'Sales', items: [{ to: '/invoices', label: 'Invoices', icon: 'invoice' }, { to: '/quotes', label: 'Quotes', icon: 'quote' }, { to: '/recurring-invoices', label: 'Recurring invoices', icon: 'repeat' }, { to: '/credit-notes', label: 'Credit notes', icon: 'credit' }, { to: '/customer-payments', label: 'Customer payments', icon: 'payment' }] },
  { title: 'Purchases', items: [{ to: '/bills', label: 'Bills', icon: 'bill' }, { to: '/purchase-orders', label: 'Purchase orders', icon: 'quote' }, { to: '/recurring-bills', label: 'Recurring bills', icon: 'repeat' }, { to: '/supplier-payments', label: 'Supplier payments', icon: 'payment' }] },
  { title: 'Banking', items: [{ to: '/banking', label: 'Bank accounts', icon: 'bank' }, { to: '/reconciliation', label: 'Reconciliation', icon: 'swap' }, { to: '/bank-rules', label: 'Bank rules', icon: 'check' }, { to: '/reconciliation-history', label: 'History', icon: 'history' }] },
  { title: 'Accounting', items: [{ to: '/accounts', label: 'Chart of accounts', icon: 'accounts' }, { to: '/journals', label: 'Journal entries', icon: 'journal' }, { to: '/opening-balances', label: 'Opening balances', icon: 'accounts' }, { to: '/accounting-periods', label: 'Accounting periods', icon: 'calendar' }, { to: '/reports', label: 'Reports', icon: 'report' }, { to: '/cash-flow', label: 'Cash-flow forecast', icon: 'chart' }] },
  { title: 'Expenses & Assets', items: [{ to: '/expenses', label: 'Expenses', icon: 'expense' }, { to: '/expense-claims', label: 'Expense claims', icon: 'check' }, { to: '/receipts', label: 'Receipts', icon: 'receipt' }, { to: '/reimbursements', label: 'Reimbursements', icon: 'payment' }, { to: '/inventory', label: 'Inventory', icon: 'inventory' }, { to: '/stock-adjustments', label: 'Stock adjustments', icon: 'repeat' }, { to: '/inventory-valuation', label: 'Inventory valuation', icon: 'report' }, { to: '/fixed-assets', label: 'Fixed assets', icon: 'asset' }, { to: '/depreciation', label: 'Depreciation', icon: 'chart' }, { to: '/asset-disposals', label: 'Asset disposals', icon: 'asset' }] },
  { title: 'Projects', items: [{ to: '/projects', label: 'Projects', icon: 'project' }, { to: '/time-tracking', label: 'Time tracking', icon: 'clock' }, { to: '/project-costs', label: 'Project costs', icon: 'expense' }, { to: '/project-budgets', label: 'Project budgets', icon: 'report' }, { to: '/budget-vs-actual', label: 'Budget vs actual', icon: 'chart' }] },
  { title: 'People & Contacts', items: [{ to: '/contacts', label: 'Contacts', icon: 'contacts' }, { to: '/payroll', label: 'Payroll', icon: 'payroll' }] },
  { title: 'Administration', items: [{ to: '/files', label: 'Files & documents', icon: 'folder' }, { to: '/settings', label: 'Settings', icon: 'settings' }] },
];

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, string> = {
    grid:'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    chart:'M4 19V5M4 19h16M8 16v-4M12 16V8M16 16V6',
    spark:'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 16l.6 1.8L21 18.4l-1.4.6L19 21l-.6-2-1.4-.6 1.4-.6L19 16z',
    invoice:'M6 3h9l4 4v14H6zM15 3v5h5M9 12h6M9 16h6',
    quote:'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
    repeat:'M17 7h4V3M21 7l-4-4M7 17H3v4M3 17l4 4M4 7h10a4 4 0 014 4v1M20 17H10a4 4 0 01-4-4v-1',
    credit:'M6 4h12v16H6zM9 9h6M9 13h4',
    payment:'M3 7h18v12H3zM3 11h18M7 16h4',
    bill:'M7 3h10v18H7zM10 8h4M10 12h4M10 16h4',
    bank:'M3 9l9-6 9 6M5 9v9M9 9v9M15 9v9M19 9v9M3 21h18',
    swap:'M7 7h12l-3-3M17 17H5l3 3',
    history:'M4 12a8 8 0 108-8 8 8 0 00-5.7 2.3L4 9M4 4v5h5M12 8v5l3 2',
    accounts:'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5',
    journal:'M5 4h14v16H5zM8 8h8M8 12h6M8 16h4',
    calendar:'M5 5h14v15H5zM8 3v4M16 3v4M5 10h14',
    report:'M5 3h14v18H5zM8 8h8M8 12h8M8 16h5',
    expense:'M4 5h16v14H4zM8 9h8M8 13h5',
    check:'M5 12l4 4L19 6',
    receipt:'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
    inventory:'M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10',
    asset:'M5 5h14v14H5zM8 9h8M8 13h5',
    project:'M4 5h16v14H4zM8 5v14M4 10h16',
    clock:'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
    contacts:'M16 20v-1a4 4 0 00-4-4H8a4 4 0 00-4 4v1M10 11a4 4 0 100-8 4 4 0 000 8zM20 20v-1a4 4 0 00-3-3.9M17 3.1a4 4 0 010 7.8',
    payroll:'M6 3h12v18H6zM9 7h6M9 11h6M9 15h3',
    folder:'M3 6h7l2 2h9v11H3z',
    settings:'M12 8a4 4 0 100 8 4 4 0 000-8zM4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4M12 3v2M12 19v2',
    help:'M12 18h.01M9.5 9a2.5 2.5 0 115 0c0 2-2.5 2-2.5 2.5V13',
    bell:'M18 8a6 6 0 00-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
    search:'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
    plus:'M12 5v14M5 12h14',
    chevron:'M9 6l6 6-6 6',
    menu:'M4 7h16M4 12h16M4 17h16',
    logout:'M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 00-2-2h-6',
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name].split('M').slice(1).map((p,i)=><path key={i} d={'M'+p}/>)}</svg>;
}

export function AppShell() {
  const { session, organizations, activeOrg, setActiveOrgId, logout } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const location = useLocation();

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return GROUPS.flatMap(g => g.items).filter(i => i.label.toLowerCase().includes(query.toLowerCase())).slice(0, 7);
  }, [query]);

  if (!session) return <Navigate to="/login" replace />;

  const initials = activeOrg?.name?.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase() || 'HA';

  const sidebar = (
    <aside className={`hero-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="hero-brand">
        <div className="hero-mark">H</div>
        {!collapsed && <div><strong>Hero</strong><span>Accounting</span></div>}
      </div>
      <div className="org-switcher">
        <div className="org-avatar">{initials}</div>
        {!collapsed && <div className="org-meta"><b>{activeOrg?.name || 'Your organization'}</b><span>{activeOrg?.role_name || 'Workspace'}</span></div>}
        {!collapsed && organizations.length > 1 && <select aria-label="Organization" value={activeOrg?.id || ''} onChange={e => setActiveOrgId(e.target.value)}><option value="">Switch</option>{organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>}
      </div>
      <nav className="hero-nav">
        {GROUPS.map(group => <div className="nav-group" key={group.title}>
          {!collapsed && <div className="nav-heading">{group.title}</div>}
          {group.items.map(item => <NavLink title={collapsed ? item.label : undefined} key={item.to} to={item.to} end={item.end} className={({isActive}) => `hero-nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon"><Icon name={item.icon} size={17}/></span><span className="nav-label">{item.label}</span>
          </NavLink>)}
        </div>)}
      </nav>
      <div className="sidebar-bottom">
        <button className="collapse-btn" onClick={() => setCollapsed(v=>!v)}><Icon name="chevron" size={15}/><span>{collapsed ? 'Expand menu' : 'Collapse menu'}</span></button>
        {!collapsed && <div className="help-card"><span><Icon name="help" size={14}/></span><div><b>Need help?</b><small>Visit the Hero help centre</small></div></div>}
        <button onClick={logout} className="signout"><Icon name="logout" size={16}/><span>{collapsed ? '' : 'Sign out'}</span></button>
      </div>
    </aside>
  );

  return <div className={`hero-app ${collapsed ? 'nav-collapsed' : ''}`}>
    <div className={`mobile-overlay ${mobileOpen ? 'show' : ''}`} onClick={() => setMobileOpen(false)} />
    <div className={`sidebar-wrap ${mobileOpen ? 'open' : ''}`}>{sidebar}</div>
    <div className="hero-main">
      <header className="hero-header">
        <button className="mobile-menu" onClick={() => setMobileOpen(true)}><Icon name="menu" size={20}/></button>
        <div className="header-breadcrumb"><span>Workspace</span><b>/</b><strong>{GROUPS.flatMap(g=>g.items).find(i=>i.to === location.pathname)?.label || 'Dashboard'}</strong></div>
        <div className="header-search-wrap">
          <button className="header-search" onClick={() => setShowSearch(v => !v)}><Icon name="search" size={16}/><span>Search anything</span><kbd>⌘ K</kbd></button>
          {showSearch && <div className="search-popover"><div className="search-input-row"><Icon name="search" size={15}/><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search pages..." /></div>{results.length ? results.map(r => <NavLink key={r.to} to={r.to} onClick={() => {setShowSearch(false);setQuery('')}}><Icon name={r.icon} size={15}/>{r.label}<Icon name="chevron" size={13}/></NavLink>) : <small>{query ? 'No matching pages' : 'Try Sales, Banking or Reports'}</small>}</div>}
        </div>
        <div className="header-actions">
          <button className="header-icon" title="Help"><Icon name="help" size={18}/></button>
          <button className="header-icon notification" title="Notifications"><Icon name="bell" size={18}/><i/></button>
          <div className="user-menu"><div className="user-avatar">{session.userId?.slice(0, 2).toUpperCase() || 'U'}</div><div className="user-meta"><b>Account</b><span>Signed in</span></div><Icon name="chevron" size={13}/></div>
        </div>
      </header>
      <main className="hero-content">{organizations.length === 0 ? <NoOrgPrompt /> : <Outlet />}</main>
    </div>
  </div>;
}

function NoOrgPrompt() {
  const { createOrganization } = useSession();
  const [countries, setCountries] = useState<{ countryCode: string; name: string; defaultCurrency: string }[]>([]);
  const [country, setCountry] = useState('AU');
  useEffect(() => { api.countries.list().then(setCountries).catch(() => setCountries([{countryCode:'AU',name:'Australia',defaultCurrency:'AUD'},{countryCode:'GB',name:'United Kingdom',defaultCurrency:'GBP'},{countryCode:'US',name:'United States',defaultCurrency:'USD'},{countryCode:'CA',name:'Canada',defaultCurrency:'CAD'},{countryCode:'IN',name:'India',defaultCurrency:'INR'},{countryCode:'NZ',name:'New Zealand',defaultCurrency:'NZD'}])); }, []);
  return <div className="setup-card"><div className="setup-icon"><Icon name="grid" size={20}/></div><div className="eyebrow">Get started</div><h1>Set up your organization</h1><p>Create your workspace to configure your chart of accounts, invoices and financial reporting.</p><form onSubmit={async e => {e.preventDefault(); const f=e.target as HTMLFormElement; await createOrganization((f.elements.namedItem('name') as HTMLInputElement).value,country);}}><input name="name" required placeholder="Business name" /> <select value={country} onChange={e=>setCountry(e.target.value)}>{countries.map(c=><option key={c.countryCode} value={c.countryCode}>{c.name} ({c.defaultCurrency})</option>)}</select><button>Create organization</button></form></div>;
}
