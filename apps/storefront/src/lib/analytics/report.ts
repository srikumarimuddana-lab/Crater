import 'server-only';
import { getRepository } from '@/lib/commerce/repository-factory';
import { memoryStateOf } from '@/lib/commerce/memory-repository';
import { pgPoolOf } from '@/lib/commerce/postgres-repository';
import type { CommerceRepository } from '@/lib/commerce/records';
import { requireAdmin } from '@/lib/admin/session';
import { addDays } from '@/lib/admin/local-time';
import type { FinanceRepository } from '@/lib/finance/types';
import { analyticsRepository } from './repository';
import type { EventName, Mode, StoredEvent } from './schema';

export type Ranking = { label:string; count:number }[];
export type Traffic = { pageViews:number; sessions:number; convertedSessions:number; purchases:number; conversion:number|null; pages:Ranking; clicks:Ranking; devices:Ranking; sources:Ranking; stages:Ranking; daily:{date:string;views:number;sessions:number}[] };
const stages:EventName[]=['page_view','product_view','add_to_cart','begin_checkout','purchase'];
function rank(entries:string[]):Ranking { const counts=new Map<string,number>();for(const label of entries)counts.set(label,(counts.get(label)??0)+1);return [...counts].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label)).slice(0,20); }
/** Denominator is consented sessions with a page view, never page views or people. */
export function summarizeTraffic(events:StoredEvent[]):Traffic {
  const views=events.filter(e=>e.name==='page_view');const sessions=new Set(views.map(e=>e.sessionId));
  const purchase=events.filter(e=>e.name==='purchase');const converted=new Set(purchase.filter(e=>sessions.has(e.sessionId)).map(e=>e.sessionId));
  const days=[...new Set(views.map(e=>e.occurredAt.slice(0,10)))].sort();
  return {pageViews:views.length,sessions:sessions.size,convertedSessions:converted.size,purchases:purchase.length,conversion:sessions.size?converted.size/sessions.size:null,
    pages:rank(views.map(e=>e.path)),clicks:rank(events.filter(e=>e.name==='cta_click').map(e=>e.clickId!)),devices:rank(views.map(e=>e.device)),sources:rank(views.map(e=>e.source)),
    stages:stages.map(label=>({label,count:new Set(events.filter(e=>e.name===label&&sessions.has(e.sessionId)).map(e=>e.sessionId)).size})),
    daily:days.map(date=>{const e=views.filter(e=>e.occurredAt.startsWith(date));return {date,views:e.length,sessions:new Set(e.map(x=>x.sessionId)).size};})};
}
export function dateRange(from:string|undefined,to:string|undefined,now=new Date()):{from:string;to:string;start:Date;end:Date} {
  const valid=(s:string|undefined):s is string=>Boolean(s&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s);
  const today=now.toISOString().slice(0,10);
  const endDate=valid(to)&&to<=today?to:today;
  const first=valid(from)?from:addDays(endDate,-29);
  if(first>endDate || first<addDays(today,-89)) throw new Error('Choose an ordered date range within the last 90 days.');
  return {from:first,to:endDate,start:new Date(`${first}T00:00:00Z`),end:new Date(`${addDays(endDate,1)}T00:00:00Z`)};
}
export async function readTraffic(repo:CommerceRepository,from:Date,to:Date,mode:Mode):Promise<Traffic> {
  if(repo.kind==='memory')return summarizeTraffic(await analyticsRepository(repo).events(from,to,mode));
  const pool=pgPoolOf(repo);
  const params=[mode,from,to];
  // Aggregate on the server; never load a period's raw traffic into application memory.
  const base="from commerce.analytics_events where mode=$1 and occurred_at >= $2 and occurred_at < $3";
  const [dimensions,metrics,funnel,days]=await Promise.all([
    pool.query(`select name,path,click_id,device,source,count(*)::int as n ${base} and name in ('page_view','cta_click') group by name,path,click_id,device,source`,params),
    pool.query(`with e as (select * ${base}), s as (select distinct session_id from e where name='page_view')
      select (select count(*) from e where name='page_view')::int as views,(select count(*) from s)::int as sessions,
      (select count(*) from e where name='purchase')::int as purchases,
      (select count(distinct session_id) from e where name='purchase' and session_id in (select session_id from s))::int as converted`,params),
    pool.query(`with e as (select name,session_id ${base}) select name,count(distinct session_id)::int as n from e where session_id in(select session_id from e where name='page_view') group by name`,params),
    pool.query(`select (occurred_at at time zone 'UTC')::date::text as date,count(*)::int as views,count(distinct session_id)::int as sessions ${base} and name='page_view' group by 1 order by 1`,params),
  ]);
  const ranking=(name:string,key:string):Ranking=>{const map=new Map<string,number>();for(const r of dimensions.rows)if(r.name===name)map.set(r[key],(map.get(r[key])??0)+r.n);return [...map].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label)).slice(0,20);};
  const m=metrics.rows[0];
  return {pageViews:m.views,sessions:m.sessions,purchases:m.purchases,convertedSessions:m.converted,conversion:m.sessions?m.converted/m.sessions:null,pages:ranking('page_view','path'),clicks:ranking('cta_click','click_id'),devices:ranking('page_view','device'),sources:ranking('page_view','source'),stages:stages.map(label=>({label,count:funnel.rows.find(r=>r.name===label)?.n??0})),daily:days.rows};
}
export type Sales = {orders:number;grossMinor:number;shippingMinor:number;taxMinor:number;totalMinor:number;backlog:number;returningPurchasers:number;knownPurchasers:number;daily:{date:string;orders:number;grossMinor:number}[];products:{title:string;units:number;grossMinor:number}[]};
export async function readSales(repo:CommerceRepository,from:Date,to:Date,mode:Mode):Promise<Sales> {
  const prefix=mode==='stripe-live'?'cs_live_':mode==='stripe-test'?'cs_test_':'fixture_';
  if(repo.kind==='memory') {
    const rows=memoryStateOf(repo).orders.filter(o=>['PAID','REFUNDED','PARTIALLY_REFUNDED'].includes(o.financialStatus)&&o.stripeSessionId.startsWith(prefix)&&Date.parse(o.processedAt)>=+from&&Date.parse(o.processedAt)<+to);
    const earlierEmails=new Set(memoryStateOf(repo).orders.filter(o=>['PAID','REFUNDED','PARTIALLY_REFUNDED'].includes(o.financialStatus)&&o.stripeSessionId.startsWith(prefix)&&Date.parse(o.processedAt)<+from&&o.email).map(o=>o.email!.trim().toLowerCase()));
    const purchaserEmails=new Set(rows.filter(o=>o.email).map(o=>o.email!.trim().toLowerCase()));
    const days=new Map<string,{date:string;orders:number;grossMinor:number}>();const products=new Map<string,{title:string;units:number;grossMinor:number}>();
    for(const o of rows){const date=o.processedAt.slice(0,10);const d=days.get(date)??{date,orders:0,grossMinor:0};d.orders++;d.grossMinor+=o.subtotalMinor;days.set(date,d);for(const l of o.lines){const p=products.get(l.variantId)??{title:l.title,units:0,grossMinor:0};p.units+=l.quantity;p.grossMinor+=l.quantity*l.unitMinor;products.set(l.variantId,p);}}
    return {returningPurchasers:[...purchaserEmails].filter(email=>earlierEmails.has(email)).length,knownPurchasers:purchaserEmails.size,orders:rows.length,grossMinor:rows.reduce((n,o)=>n+o.subtotalMinor,0),shippingMinor:rows.reduce((n,o)=>n+o.shippingMinor,0),taxMinor:rows.reduce((n,o)=>n+o.taxMinor,0),totalMinor:rows.reduce((n,o)=>n+o.totalMinor,0),backlog:rows.filter(o=>o.fulfilmentStatus!=='FULFILLED').length,daily:[...days.values()],products:[...products.values()].sort((a,b)=>b.grossMinor-a.grossMinor).slice(0,10)};
  }
  const pool=pgPoolOf(repo);const where="o.financial_status in ('PAID','REFUNDED','PARTIALLY_REFUNDED') and starts_with(o.stripe_session_id,$1) and o.processed_at >= $2 and o.processed_at < $3";
  const [summary,daily,products]=await Promise.all([
    pool.query(`select count(*)::int as orders,coalesce(sum(subtotal_minor),0)::text as gross,coalesce(sum(shipping_minor),0)::text as shipping,coalesce(sum(tax_minor),0)::text as tax,coalesce(sum(total_minor),0)::text as total,count(*) filter(where fulfilment_status<>'FULFILLED')::int as backlog,count(distinct lower(trim(o.email)))::int as known, count(distinct lower(trim(o.email))) filter(where exists(select 1 from commerce.orders prior where lower(trim(prior.email))=lower(trim(o.email)) and prior.processed_at<$2 and starts_with(prior.stripe_session_id,$1) and prior.financial_status in ('PAID','PARTIALLY_REFUNDED','REFUNDED')))::int as returning_count from commerce.orders o where ${where}`,[prefix,from,to]),
    pool.query(`select (processed_at at time zone 'UTC')::date::text as date,count(*)::int as orders,sum(subtotal_minor)::text as gross from commerce.orders o where ${where} group by 1 order by 1`,[prefix,from,to]),
    pool.query(`select l.title,sum(l.quantity)::int as units,sum(l.quantity*l.unit_minor)::text as gross from commerce.order_lines l join commerce.orders o on o.id=l.order_id where ${where} group by l.variant_id,l.title order by sum(l.quantity*l.unit_minor) desc limit 10`,[prefix,from,to]),
  ]);const s=summary.rows[0];
  return {returningPurchasers:s.returning_count,knownPurchasers:s.known,orders:s.orders,grossMinor:Number(s.gross),shippingMinor:Number(s.shipping),taxMinor:Number(s.tax),totalMinor:Number(s.total),backlog:s.backlog,daily:daily.rows.map(d=>({date:d.date,orders:d.orders,grossMinor:Number(d.gross)})),products:products.rows.map(p=>({title:p.title,units:p.units,grossMinor:Number(p.gross)}))};
}
/** Shared overview/report definition: confirmed refunds by provider success date, in one mode. */
export async function readRefundTotals(repo:CommerceRepository,from:Date,to:Date,mode:Mode):Promise<{totalMinor:number;productMinor:number}> {
  if(mode==='fixture')return {totalMinor:0,productMinor:0};
  const financeMode=mode==='stripe-live'?'live':'test';
  if(repo.kind==='memory') {
    const finance=memoryStateOf(repo).ext.get('finance:repository') as FinanceRepository|undefined;
    if(!finance)return {totalMinor:0,productMinor:0};
    const refunds=(await finance.snapshot(financeMode)).refunds.filter(r=>r.status==='succeeded'&&Date.parse(r.succeededAt??r.updatedAt)>=+from&&Date.parse(r.succeededAt??r.updatedAt)<+to);
    return {totalMinor:refunds.reduce((n,r)=>n+r.amountMinor,0),productMinor:refunds.reduce((n,r)=>n+r.productMinor,0)};
  }
  const r=await pgPoolOf(repo).query(`select coalesce(sum((data->>'amountMinor')::bigint),0)::text as total,coalesce(sum((data->>'productMinor')::bigint),0)::text as product
    from commerce.finance_refunds where mode=$1 and data->>'status'='succeeded'
    and coalesce(data->>'succeededAt',data->>'updatedAt')::timestamptz >= $2
    and coalesce(data->>'succeededAt',data->>'updatedAt')::timestamptz < $3`,[financeMode,from,to]);
  return {totalMinor:Number(r.rows[0].total),productMinor:Number(r.rows[0].product)};
}
export async function getAnalyticsReport(input:{from?:string;to?:string;mode?:string}={}) {
  await requireAdmin('analytics:read');
  const range=dateRange(input.from,input.to);
  const mode:Mode=input.mode==='stripe-live'?'stripe-live':input.mode==='fixture'?'fixture':'stripe-test';
  const repo=await getRepository();
  const [traffic,sales,products,refunds]=await Promise.all([readTraffic(repo,range.start,range.end,mode),readSales(repo,range.start,range.end,mode),repo.listProducts(),readRefundTotals(repo,range.start,range.end,mode)]);
  const previousStart=new Date(+range.start-(+range.end-+range.start));
  const previousSales=await readSales(repo,previousStart,range.start,mode);
  const refundedProductMinor=refunds.productMinor;
  return {range,mode,traffic,sales,previousSales,refundMinor:refunds.totalMinor,refundedProductMinor,netProductMinor:sales.grossMinor-refundedProductMinor,lowStock:products.flatMap(p=>p.variants).filter(v=>v.quantity!==null&&v.quantity<=v.lowStockThreshold).length,unattributedOrders:Math.max(0,sales.orders-traffic.purchases)};
}
