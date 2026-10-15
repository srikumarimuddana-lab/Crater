import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader, TableWrap, EmptyState, Notice } from '@/components/admin/ui';
import { getAnalyticsReport, type Ranking } from '@/lib/analytics/report';
import { gate, one, type SearchParams } from '../../_lib/gate';

export const metadata:Metadata={title:'Sales & traffic'};
const money=(minor:number)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(minor/100);
function Rankings({title,rows,unit='Events'}:{title:string;rows:Ranking;unit?:string}) {
  return <section className="a-card"><h2>{title}</h2><TableWrap label={title}><table className="a-table"><thead><tr><th scope="col">{title}</th><th scope="col" className="a-num">{unit}</th></tr></thead><tbody>{rows.map(r=><tr key={r.label}><th scope="row">{r.label}</th><td className="a-num">{r.count.toLocaleString()}</td></tr>)}</tbody></table>{rows.length===0?<EmptyState>No activity recorded in this period.</EmptyState>:null}</TableWrap></section>;
}
export default async function AnalyticsPage({searchParams}:{searchParams:SearchParams}) {
  const g=await gate('analytics:read');if(!g.ok)return g.view;
  const sp=await searchParams;
  let report:Awaited<ReturnType<typeof getAnalyticsReport>>;
  try{report=await getAnalyticsReport({from:one(sp.from),to:one(sp.to),mode:one(sp.mode)});}
  catch(error){if(error instanceof Error&&error.message.startsWith('Choose an ordered'))return <><PageHeader title="Sales & traffic"/><Notice tone="warning">{error.message} <Link href="/admin/analytics">Reset date range</Link></Notice></>;throw error;}
  const {traffic:t,sales:s,range,mode}=report;
  const tiles=[
    {label:'Gross product sales',value:money(s.grossMinor),detail:'Paid order subtotals by order date. Excludes tax and shipping.'},
    {label:'Net product sales',value:money(report.netProductMinor),detail:'Gross product sales minus confirmed product refunds by refund date.'},
    {label:'Refunds',value:money(report.refundMinor),detail:'Confirmed refunds in this period, including refunded tax and shipping.'},
    {label:'Returning purchasers',value:s.returningPurchasers.toLocaleString(),detail:`Of ${s.knownPurchasers} distinct purchaser email addresses this period, these also have a paid order before the period. Email matching is not identity verification.`},
    {label:'Paid orders',value:s.orders.toLocaleString(),detail:'Paid, partially refunded and refunded orders in this payment mode.'},
    {label:'Average order value',value:s.orders?money(Math.round(s.grossMinor/s.orders)):'—',detail:'Gross product sales divided by paid orders.'},
    {label:'Page views',value:t.pageViews.toLocaleString(),detail:'Consented page views; repeat views count. Staff cookies and known bots are excluded.'},
    {label:'Observed sessions',value:t.sessions.toLocaleString(),detail:'Anonymous consented sessions with a page view. A session expires after 30 minutes idle.'},
    {label:'Session conversion',value:t.conversion===null?'—':`${(t.conversion*100).toFixed(1)}%`,detail:`${t.convertedSessions} observed sessions with a confirmed purchase ÷ ${t.sessions} observed sessions.`},
  ];
  const max=Math.max(1,...s.daily.map(d=>d.grossMinor));
  const exportQuery=new URLSearchParams({from:range.from,to:range.to,mode});
  return <>
    <PageHeader title="Sales & traffic" actions={<a className="a-btn" href={`/admin/analytics/export?${exportQuery}`}>Export daily CSV</a>}/>
    <form className="a-card a-row" method="get" aria-label="Report filters">
      <label className="a-field">From<input type="date" name="from" defaultValue={range.from} required/></label>
      <label className="a-field">Through<input type="date" name="to" defaultValue={range.to} required/></label>
      <label className="a-field">Payment mode<select name="mode" defaultValue={mode}><option value="stripe-test">Stripe test</option><option value="stripe-live">Stripe live</option><option value="fixture">Fixture</option></select></label>
      <button className="a-btn a-btn-primary" type="submit">Update report</button>
    </form>
    <p className="a-muted">Reporting dates use UTC. Currency: CAD. {mode==='fixture'?'Fixture mode is development data only.':mode==='stripe-test'?'Test transactions are separate from live sales.':'Live payment records only.'}</p>
    <dl className="a-tiles">{tiles.map(tile=><div className="a-tile" key={tile.label}><dt>{tile.label}</dt><dd className="a-big">{tile.value}</dd><dd className="a-def">{tile.detail}</dd></div>)}</dl>
    <section className="a-card"><h2>Collection coverage</h2><p>{t.purchases} attributed paid orders; {report.unattributedOrders} paid orders without a retained consented attribution in this period.</p><p className="a-muted">Traffic describes consenting visitors only. Consent acceptance rate is unavailable because rejected visits are not tracked. No page views are treated as unique people. Raw traffic is retained for 90 days; anonymous daily counts for 24 months.</p></section>
    <section className="a-card"><h2>Operations at a glance</h2><dl className="a-tiles"><div><dt>Shipping collected</dt><dd>{money(s.shippingMinor)}</dd></div><div><dt>Tax collected</dt><dd>{money(s.taxMinor)}</dd></div><div><dt>Unfulfilled orders from period</dt><dd>{s.backlog}</dd></div><div><dt>Current low-stock variants</dt><dd>{report.lowStock}</dd></div></dl><p><Link href="/admin/integrations">Review integration delivery and configuration</Link></p></section>
    <section className="a-card"><h2>Sales by day</h2><p className="a-muted">Previous equal-length period: {money(report.previousSales.grossMinor)} gross product sales across {report.previousSales.orders} paid orders. {report.previousSales.grossMinor ? `${(((s.grossMinor-report.previousSales.grossMinor)/report.previousSales.grossMinor)*100).toFixed(1)}% change in gross product sales.` : 'No percentage comparison is available without prior sales.'}</p>
      {s.daily.length?<svg viewBox="0 0 700 180" role="img" aria-labelledby="sales-chart-title" className="a-chart"><title id="sales-chart-title">Gross product sales by day. Exact values follow in the table.</title><line x1="10" y1="160" x2="690" y2="160" stroke="currentColor"/>{s.daily.map((d,i)=>{const w=680/s.daily.length;const h=d.grossMinor/max*135;return <rect key={d.date} x={10+i*w+w*.15} y={160-h} width={Math.max(1,w*.7)} height={h} fill="currentColor"><title>{d.date}: {money(d.grossMinor)}</title></rect>;})}</svg>:null}
      <TableWrap label="Sales and traffic by day"><table className="a-table"><thead><tr><th scope="col">Date, UTC</th><th scope="col">Paid orders</th><th scope="col">Gross product sales</th><th scope="col">Page views</th><th scope="col">Sessions</th></tr></thead><tbody>{Array.from({length:Math.round((+range.end-+range.start)/86400000)},(_,i)=>new Date(+range.start+i*86400000).toISOString().slice(0,10)).map(date=>{const sale=s.daily.find(d=>d.date===date);const views=t.daily.find(d=>d.date===date);return <tr key={date}><th scope="row">{date}</th><td>{sale?.orders??0}</td><td>{money(sale?.grossMinor??0)}</td><td>{views?.views??0}</td><td>{views?.sessions??0}</td></tr>;})}</tbody></table></TableWrap>
    </section>
    <section className="a-card"><h2>Shopping stages</h2><p className="a-muted">Distinct observed sessions reaching each stage during the period. These are independent stage counts, not a claim that every shopper followed the stages in order. Purchases are recorded from server-confirmed orders.</p><TableWrap label="Shopping stages"><table className="a-table"><thead><tr><th scope="col">Stage</th><th scope="col">Observed sessions</th></tr></thead><tbody>{t.stages.map(r=><tr key={r.label}><th scope="row">{r.label.replaceAll('_',' ')}</th><td>{r.count}</td></tr>)}</tbody></table></TableWrap></section>
    <div className="a-report-grid"><Rankings title="Top pages" rows={t.pages} unit="Page views"/><Rankings title="Registered clicks" rows={t.clicks}/><Rankings title="Device category" rows={t.devices} unit="Page views"/><Rankings title="Source category" rows={t.sources} unit="Page views"/></div>
    <section className="a-card"><h2>Top products</h2><TableWrap label="Top products"><table className="a-table"><thead><tr><th scope="col">Product</th><th scope="col">Units</th><th scope="col">Gross sales</th></tr></thead><tbody>{s.products.map((p,i)=><tr key={`${p.title}-${i}`}><th scope="row">{p.title}</th><td>{p.units}</td><td>{money(p.grossMinor)}</td></tr>)}</tbody></table>{s.products.length===0?<EmptyState>No paid products in this period.</EmptyState>:null}</TableWrap></section>
  </>;
}
