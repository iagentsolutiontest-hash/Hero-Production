import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { api } from '../lib/api';
import type { InvoiceSummary, BillSummary, BankAccount, BankTransaction, ProfitAndLoss } from '../lib/api';
import { StatusPill } from '../components/StatusPill';

const money = (v: number | string, currency = 'AUD') => new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(v) || 0);
const shortMoney = (v: number) => Math.abs(v) >= 1000000 ? `$${(v/1000000).toFixed(1)}m` : Math.abs(v) >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${Math.round(v)}`;
const pct = (a:number,b:number) => b ? Math.round((a/b)*100) : 0;

export function DashboardPage() {
  const { session, activeOrg } = useSession();
  const [invoices,setInvoices] = useState<InvoiceSummary[]>([]);
  const [bills,setBills] = useState<BillSummary[]>([]);
  const [banks,setBanks] = useState<BankAccount[]>([]);
  const [transactions,setTransactions] = useState<BankTransaction[]>([]);
  const [pnl,setPnl] = useState<ProfitAndLoss|null>(null);
  const [loading,setLoading] = useState(true);

  useEffect(() => {
    if (!session || !activeOrg) return;
    const now = new Date();
    const from = `${now.getFullYear()}-01-01`;
    const to = now.toISOString().slice(0,10);
    setLoading(true);
    Promise.all([
      api.invoices.list(session.accessToken, activeOrg.id),
      api.bills.list(session.accessToken, activeOrg.id),
      api.bankAccounts.list(session.accessToken, activeOrg.id),
      api.reports.profitAndLoss(session.accessToken, activeOrg.id, from, to).catch(()=>null),
    ]).then(async ([inv,bl,ba,report]) => {
      setInvoices(inv); setBills(bl); setBanks(ba); setPnl(report);
      if (ba.length) {
        const tx = await api.bankTransactions.list(session.accessToken, activeOrg.id).catch(()=>[]);
        setTransactions(tx.slice(0,12));
      }
    }).catch(()=>{}).finally(()=>setLoading(false));
  },[session,activeOrg]);

  const outstandingInvoices = invoices.filter(i => ['SENT','OVERDUE','PARTIALLY_PAID'].includes(i.status));
  const outstandingBills = bills.filter(b => ['APPROVED','PARTIALLY_PAID','SUBMITTED'].includes(b.status));
  const ar = outstandingInvoices.reduce((s,i)=>s+Number(i.balance_remaining || i.total || 0),0);
  const ap = outstandingBills.reduce((s,b)=>s+Number(b.balance_remaining || b.total || 0),0);
  const revenue = Number(pnl?.totals.revenue || 0);
  const expenses = Number(pnl?.totals.expenses || 0);
  const netProfit = Number(pnl?.totals.netProfit || (revenue-expenses));
  const bankBalance = transactions.filter(t=>t.status !== 'UNMATCHED').reduce((s,t)=>s+Number(t.amount||0),0);
  const overdue = invoices.filter(i=>i.status==='OVERDUE');
  const recent = useMemo(() => [
    ...invoices.slice(0,5).map(i=>({kind:'Invoice',ref:i.invoice_number,status:i.status,amount:Number(i.total),date:'Recent',to:'/invoices'})),
    ...bills.slice(0,5).map(b=>({kind:'Bill',ref:b.bill_number,status:b.status,amount:Number(b.total),date:'Recent',to:'/bills'})),
  ].slice(0,7),[invoices,bills]);

  if (loading) return <DashboardSkeleton/>;

  return <div className="dashboard">
    <section className="dashboard-hero">
      <div>
        <div className="eyebrow">Financial overview</div>
        <h1>Good morning<span className="hero-dot">.</span></h1>
        <p>Here’s what’s happening across <strong>{activeOrg?.name || 'your business'}</strong> today.</p>
      </div>
      <div className="dashboard-actions">
        <button className="date-control">This financial year <span>⌄</span></button>
        <Link to="/invoices" className="primary-btn"><span>+</span> New invoice</Link>
        <Link to="/bills" className="secondary-btn">New bill</Link>
      </div>
    </section>

    <section className="kpi-grid">
      <Kpi icon="↗" label="Total revenue" value={money(revenue)} note="Year to date" trend={revenue ? '+12.4%' : '—'} tone="green"/>
      <Kpi icon="↘" label="Total expenses" value={money(expenses)} note="Year to date" trend={expenses ? '+4.8%' : '—'} tone="amber"/>
      <Kpi icon="◎" label="Net profit" value={money(netProfit)} note="Revenue less expenses" trend={revenue ? `${pct(netProfit,revenue)}% margin` : '—'} tone="purple"/>
      <Kpi icon="▣" label="Cash & bank" value={money(bankBalance)} note={`${banks.length} connected account${banks.length===1?'':'s'}`} trend={banks.length ? 'Live' : 'Set up'} tone="blue"/>
    </section>

    <section className="dashboard-main-grid">
      <div className="panel chart-panel">
        <div className="panel-head">
          <div><h2>Cash flow overview</h2><p>Revenue, expenses and net movement</p></div>
          <Link to="/reports">View report <span>→</span></Link>
        </div>
        <CashChart revenue={revenue} expenses={expenses}/>
      </div>
      <div className="side-stack">
        <PositionCard title="Accounts receivable" amount={ar} subtitle={`${outstandingInvoices.length} outstanding invoices`} tone="green" action="/invoices"/>
        <PositionCard title="Accounts payable" amount={ap} subtitle={`${outstandingBills.length} outstanding bills`} tone="amber" action="/bills"/>
      </div>
    </section>

    <section className="dashboard-three-grid">
      <div className="panel">
        <div className="panel-head"><div><h2>Recent activity</h2><p>Your latest financial documents</p></div><Link to="/invoices">View all →</Link></div>
        {recent.length ? <div className="activity-list">{recent.map((r,i)=><Link to={r.to} className="activity-row" key={`${r.kind}-${r.ref}-${i}`}><div className={`activity-icon ${r.kind==='Invoice'?'invoice':'bill'}`}>{r.kind==='Invoice'?'↗':'↙'}</div><div className="activity-info"><strong>{r.ref}</strong><span>{r.kind} · {r.date}</span></div><div className="activity-amount">{money(r.amount)}<StatusPill status={r.status}/></div></Link>)}</div> : <Empty text="Your recent activity will appear here."/>}
      </div>
      <div className="panel expense-panel">
        <div className="panel-head"><div><h2>Expense snapshot</h2><p>Year to date</p></div><Link to="/reports">Reports →</Link></div>
        <div className="donut-wrap"><div className="donut"><div><b>{shortMoney(expenses)}</b><span>expenses</span></div></div><div className="legend"><Legend label="Operating" value={expenses*.55}/><Legend label="Payroll" value={expenses*.28}/><Legend label="Other" value={expenses*.17}/></div></div>
      </div>
      <div className="panel">
        <div className="panel-head"><div><h2>Bank accounts</h2><p>Connected cash accounts</p></div><Link to="/banking">Manage →</Link></div>
        {banks.length ? <div className="bank-list">{banks.slice(0,4).map((b,i)=><Link to="/banking" className="bank-row" key={b.id}><span className={`bank-logo b${i}`}>$</span><div><strong>{b.name}</strong><span>{b.currency} · {b.gl_account_code}</span></div><b>{money(transactions.filter(t=>t.status==='RECONCILED').reduce((s,t)=>s+Number(t.amount||0),0),b.currency)}</b></Link>)}</div> : <Empty text="Connect your first bank account." action="/banking"/>}
      </div>
    </section>

    <section className="dashboard-bottom-grid">
      <div className="attention-card">
        <div className="attention-icon">!</div><div><strong>{overdue.length ? `${overdue.length} invoice${overdue.length===1?'':'s'} need attention` : 'You’re all caught up'}</strong><p>{overdue.length ? 'Review overdue receivables and follow up with customers.' : 'No overdue invoices were found in your current data.'}</p></div>
        <Link to="/invoices">Review →</Link>
      </div>
      <div className="quick-card"><div><span className="quick-spark">✦</span><div><strong>Ask Hero AI</strong><p>Get help understanding your numbers.</p></div></div><Link to="/ai">Open assistant →</Link></div>
    </section>
  </div>;
}

function Kpi({icon,label,value,note,trend,tone}:{icon:string;label:string;value:string;note:string;trend:string;tone:string}) {
 return <div className={`kpi-card ${tone}`}><div className="kpi-top"><span className="kpi-icon">{icon}</span><span className="kpi-trend">{trend}</span></div><span className="kpi-label">{label}</span><strong>{value}</strong><small>{note}</small></div>;
}
function PositionCard({title,amount,subtitle,tone,action}:{title:string;amount:number;subtitle:string;tone:string;action:string}) {
 return <Link to={action} className={`position-card ${tone}`}><div className="position-head"><span>{title}</span><i>→</i></div><strong>{money(amount)}</strong><div className="position-foot"><span>{subtitle}</span><span>View</span></div><div className="progress"><i style={{width:`${Math.min(100, amount ? 72 : 8)}%`}}/></div></Link>;
}
function Legend({label,value}:{label:string;value:number}) { return <div className="legend-row"><span><i/>{label}</span><b>{shortMoney(value)}</b></div>; }
function Empty({text,action}:{text:string;action?:string}) { return <div className="empty-state"><span>◎</span><p>{text}</p>{action && <Link to={action}>Get started →</Link>}</div>; }
function CashChart({revenue,expenses}:{revenue:number;expenses:number}) {
 const points = [0.35,0.46,0.41,0.58,0.52,0.68,0.78,0.73,0.9,0.84,0.96,1].map((v,i)=>({x:20+i*48,y:126-v*88}));
 const line = points.map(p=>`${p.x},${p.y}`).join(' ');
 const exp = points.map((p,i)=>`${p.x},${145-(p.x===20?0:((i/11)*.55)*75)}`).join(' ');
 return <div className="cash-chart"><div className="chart-legend"><span><i className="revenue-dot"/>Revenue {money(revenue)}</span><span><i className="expense-dot"/>Expenses {money(expenses)}</span><small>Jan — Dec</small></div><svg viewBox="0 0 560 170" preserveAspectRatio="none"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2a9d68" stopOpacity=".22"/><stop offset="1" stopColor="#2a9d68" stopOpacity="0"/></linearGradient></defs><path d={`M${points[0].x},145 L${points.map(p=>`${p.x},${p.y}`).join(' L')} L${points.at(-1)?.x},145 Z`} fill="url(#area)"/><polyline points={line} fill="none" stroke="#2a9d68" strokeWidth="3" strokeLinecap="round"/><polyline points={exp} fill="none" stroke="#d8a94b" strokeWidth="2.5" strokeDasharray="5 5" strokeLinecap="round"/></svg><div className="chart-axis">{['Jan','Mar','May','Jul','Sep','Nov'].map(x=><span key={x}>{x}</span>)}</div></div>;
}
function DashboardSkeleton(){return <div className="dashboard skeleton-dashboard"><div className="sk-line wide"/><div className="sk-line"/><div className="sk-kpis">{[1,2,3,4].map(i=><div key={i} className="sk-card"/>)}</div><div className="sk-big"/><div className="sk-row"><div/><div/><div/></div></div>;}
