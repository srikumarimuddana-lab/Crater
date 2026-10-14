import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getRepository } from '@/lib/commerce/repository-factory';
import { memoryStateOf } from '@/lib/commerce/memory-repository';
import { pgPoolOf, toOrderRecord } from '@/lib/commerce/postgres-repository';
import type { CommerceRepository, OrderRecord } from '@/lib/commerce/records';
import { commerceModeFrom } from '@/lib/commerce/config';
import { UUID, type ClientEvent, type Mode, type StoredEvent } from './schema';

type State = { events: Map<string, StoredEvent>; attribution: Map<string, { sessionId: string; mode: Mode; at: number }>; rates: Map<string, number> };
function memory(repo: CommerceRepository): State {
  const ext = memoryStateOf(repo).ext;
  if (!ext.has('analytics')) ext.set('analytics', { events: new Map(), attribution: new Map(), rates: new Map() });
  return ext.get('analytics') as State;
}
export type IngestResult = 'accepted' | 'duplicate' | 'limited';
async function insertEvent(c: PoolClient, e: StoredEvent): Promise<boolean> {
  const r = await c.query(`insert into commerce.analytics_events (id,session_id,name,path,click_id,device,source,mode,occurred_at,order_id)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict do nothing returning id`,
  [e.id,e.sessionId,e.name,e.path,e.clickId,e.device,e.source,e.mode,e.occurredAt,e.orderId]);
  if (!r.rowCount) return false;
  await c.query(`insert into commerce.analytics_daily(day,mode,name,path,click_id,device,source,event_count)
    values (($1::timestamptz at time zone 'UTC')::date,$2,$3,$4,$5,$6,$7,1)
    on conflict(day,mode,name,path,click_id,device,source) do update set event_count=commerce.analytics_daily.event_count+1`,
  [e.occurredAt,e.mode,e.name,e.path,e.clickId ?? '',e.device,e.source]);
  return true;
}
/** Stable per-checkout ID makes provider/session retries one accepted-checkout event. */
function acceptedCheckoutEvent(checkoutId:string,previous:StoredEvent,at:Date):StoredEvent {
  const hex=createHash('sha256').update(`checkout-start:${checkoutId}`).digest('hex');
  const id=`${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
  return {...previous,id,name:'begin_checkout',path:'/cart',clickId:null,orderId:null,occurredAt:at.toISOString()};
}
export function analyticsRepository(repo: CommerceRepository) {
  return {
    async ingest(event: ClientEvent, mode: Mode, at = new Date()): Promise<IngestResult> {
      const { id,sessionId,name,path,device,source,clickId } = event;
      const fields={id,sessionId,name,path,device,source,clickId};
      const e: StoredEvent = { ...fields, mode, occurredAt: at.toISOString(), orderId: null };
      const minute = Math.floor(at.getTime() / 60000);
      if (repo.kind === 'memory') {
        const s = memory(repo);
        if (s.events.has(e.id)) return 'duplicate';
        const key = `${minute}:${e.sessionId}`;
        const global = `${minute}:all`;
        if ((s.rates.get(key) ?? 0) >= 120 || (s.rates.get(global) ?? 0) >= 5000) return 'limited';
        for (const k of s.rates.keys()) if (!k.startsWith(`${minute}:`)) s.rates.delete(k);
        s.rates.set(key, (s.rates.get(key) ?? 0) + 1); s.rates.set(global, (s.rates.get(global) ?? 0) + 1);
        s.events.set(e.id, e);
        return 'accepted';
      }
      const c = await pgPoolOf(repo).connect();
      try {
        await c.query('begin');
        const seen = await c.query('select 1 from commerce.analytics_events where id=$1', [e.id]);
        if (seen.rowCount) { await c.query('commit'); return 'duplicate'; }
        // Shared durable budget bounds ingestion even when anonymous IDs are rotated.
        for (const [key, limit] of [['all',5000],[e.sessionId,120]] as const) {
          const r = await c.query(`insert into commerce.analytics_rate_buckets(bucket,starts_at,count) values ($1,$2,1)
            on conflict(bucket) do update set count=case when commerce.analytics_rate_buckets.starts_at=$2 then commerce.analytics_rate_buckets.count+1 else 1 end, starts_at=$2 returning count`, [key,new Date(minute*60000)]);
          if (Number(r.rows[0].count) > limit) { await c.query('rollback'); return 'limited'; }
        }
        const inserted = await insertEvent(c,e);
        await c.query('commit');
        return inserted ? 'accepted' : 'duplicate';
      } catch (error) { await c.query('rollback'); throw error; } finally { c.release(); }
    },
    async attachCheckout(checkoutId: string, sessionId: string, mode: Mode, at = new Date()): Promise<boolean> {
      if (!UUID.test(sessionId)) return false;
      if (repo.kind === 'memory') {
        const s = memory(repo);
        const previous = [...s.events.values()].find(e => e.sessionId === sessionId && e.mode === mode && Date.parse(e.occurredAt) >= at.getTime()-30*60000);
        const checkout=memoryStateOf(repo).checkouts.get(checkoutId);
        if (!previous || !checkout?.stripeSessionId || !['session_created','awaiting_payment'].includes(checkout.status)) return false;
        if (s.attribution.has(checkoutId)) return false;
        s.attribution.set(checkoutId, { sessionId,mode,at:at.getTime() });
        const event=acceptedCheckoutEvent(checkoutId,previous,at);
        if(!s.events.has(event.id))s.events.set(event.id,event);
        return true;
      }
      const c=await pgPoolOf(repo).connect();
      try {
        await c.query('begin');
        const previous=await c.query(`select id,session_id as "sessionId",name,path,click_id as "clickId",device,source,mode,occurred_at as "occurredAt",order_id as "orderId"
          from commerce.analytics_events where session_id=$1 and mode=$2 and occurred_at >= $3::timestamptz-interval '30 minutes' order by occurred_at limit 1`,[sessionId,mode,at]);
        if(!previous.rowCount){await c.query('commit');return false;}
        const r=await c.query(`insert into commerce.analytics_checkout_attribution(checkout_id,session_id,mode,created_at)
          select $1,$2,$3,$4 where exists(select 1 from commerce.checkouts where id=$1 and status in ('session_created','awaiting_payment') and stripe_session_id is not null)
          on conflict(checkout_id) do nothing returning checkout_id`,[checkoutId,sessionId,mode,at]);
        if(!r.rowCount){await c.query('commit');return false;}
        await insertEvent(c,acceptedCheckoutEvent(checkoutId,previous.rows[0] as StoredEvent,at));
        await c.query('commit');return true;
      } catch(error){await c.query('rollback');throw error;}finally{c.release();}
    },
    /** Called only with an order read from authoritative paid-order storage. */
    async recordPurchase(order: OrderRecord): Promise<boolean> {
      if (!['PAID','PARTIALLY_REFUNDED','REFUNDED'].includes(order.financialStatus)) return false;
      if (repo.kind === 'memory') {
        const s = memory(repo); const a = s.attribution.get(order.checkoutId);
        if (!a || !memoryStateOf(repo).orders.some(o=>o.id===order.id&&o.checkoutId===order.checkoutId&&['PAID','PARTIALLY_REFUNDED','REFUNDED'].includes(o.financialStatus)) || [...s.events.values()].some(e => e.orderId === order.id)) return false;
        const previous = [...s.events.values()].find(e => e.sessionId === a.sessionId && e.mode === a.mode);
        if (!previous) return false;
        const id = randomUUID();
        s.events.set(id,{ ...previous,id,name:'purchase',path:'/checkout/success',clickId:null,occurredAt:order.processedAt,orderId:order.id });
        s.attribution.delete(order.checkoutId);
        return true;
      }
      const c = await pgPoolOf(repo).connect();
      try {
        await c.query('begin');
        const r = await c.query(`select a.session_id,a.mode,e.device,e.source from commerce.analytics_checkout_attribution a
          join lateral (select device,source from commerce.analytics_events where session_id=a.session_id and mode=a.mode order by occurred_at limit 1) e on true
          join commerce.orders o on o.checkout_id=a.checkout_id and o.id=$2 and o.financial_status in ('PAID','PARTIALLY_REFUNDED','REFUNDED')
          where a.checkout_id=$1`,[order.checkoutId,order.id]);
        if (!r.rowCount) { await c.query('commit'); return false; }
        const a=r.rows[0];
        const inserted = await insertEvent(c,{ id:randomUUID(),sessionId:a.session_id,name:'purchase',path:'/checkout/success',clickId:null,device:a.device,source:a.source,mode:a.mode,occurredAt:order.processedAt,orderId:order.id });
        await c.query('delete from commerce.analytics_checkout_attribution where checkout_id=$1',[order.checkoutId]);
        await c.query('commit'); return inserted;
      } catch (error) { await c.query('rollback'); throw error; } finally { c.release(); }
    },
    async forgetSession(sessionId: string): Promise<void> {
      if (!UUID.test(sessionId)) return;
      if (repo.kind === 'memory') {
        const s=memory(repo);
        for (const [k,a] of s.attribution) if (a.sessionId===sessionId) s.attribution.delete(k);
        return;
      }
      await pgPoolOf(repo).query('delete from commerce.analytics_checkout_attribution where session_id=$1',[sessionId]);
    },
    async events(from: Date,to: Date,mode: Mode): Promise<StoredEvent[]> {
      if (repo.kind === 'memory') return structuredClone([...memory(repo).events.values()].filter(e=>e.mode===mode && Date.parse(e.occurredAt)>=from.getTime() && Date.parse(e.occurredAt)<to.getTime()));
      const r=await pgPoolOf(repo).query(`select id,session_id as "sessionId",name,path,click_id as "clickId",device,source,mode,occurred_at as "occurredAt",order_id as "orderId" from commerce.analytics_events where mode=$1 and occurred_at >= $2 and occurred_at < $3 order by occurred_at`,[mode,from,to]);
      return r.rows.map(e=>({...e,occurredAt:new Date(e.occurredAt).toISOString()})) as StoredEvent[];
    },
    async prune(at=new Date(), rawDays=90, aggregateMonths=24): Promise<void> {
      if (!Number.isInteger(rawDays) || rawDays<1 || rawDays>365 || !Number.isInteger(aggregateMonths) || aggregateMonths<1 || aggregateMonths>60) throw new Error('Invalid analytics retention.');
      const cutoff=new Date(at.getTime()-rawDays*86400000);
      if (repo.kind === 'memory') {
        const s=memory(repo); for (const [id,e] of s.events) if (Date.parse(e.occurredAt)<cutoff.getTime()) s.events.delete(id);
        for (const [id,a] of s.attribution) if (a.at<cutoff.getTime()) s.attribution.delete(id);
        return;
      }
      const p=pgPoolOf(repo);
      await p.query('delete from commerce.analytics_events where occurred_at < $1',[cutoff]);
      await p.query('delete from commerce.analytics_checkout_attribution where created_at < $1',[cutoff]);
      await p.query("delete from commerce.analytics_daily where day < $1::date - make_interval(months => $2::int)",[at,aggregateMonths]);
      await p.query("delete from commerce.analytics_rate_buckets where starts_at < $1::timestamptz - interval '1 day'",[at]);
    },
  };
}
export async function attachCheckoutAttribution(checkoutId: string, sessionId: string): Promise<boolean> {
  return analyticsRepository(await getRepository()).attachCheckout(checkoutId,sessionId,commerceModeFrom(process.env));
}
export async function recordPaidOrderAnalytics(order: OrderRecord): Promise<boolean> {
  return analyticsRepository(await getRepository()).recordPurchase(order);
}

/** Run from the durable operations worker/cron; never a detached timer. */
export async function runAnalyticsRetention():Promise<void> {
  return analyticsRepository(await getRepository()).prune(new Date(),Number(process.env.ANALYTICS_RAW_DAYS??90),Number(process.env.ANALYTICS_AGGREGATE_MONTHS??24));
}

/** Recover purchase attribution after a process restart or temporary analytics outage. */
export async function syncAnalyticsPurchases():Promise<number> {
  const repo=await getRepository();const analytics=analyticsRepository(repo);let orders:OrderRecord[];
  if(repo.kind==='memory') orders=memoryStateOf(repo).orders.filter(o=>memory(repo).attribution.has(o.checkoutId));
  else {const result=await pgPoolOf(repo).query("select o.* from commerce.orders o join commerce.analytics_checkout_attribution a on a.checkout_id=o.checkout_id where o.financial_status in ('PAID','PARTIALLY_REFUNDED','REFUNDED') order by o.id limit 1000");orders=result.rows.map(o=>toOrderRecord(o,[]));}
  let count=0;for(const order of orders)if(await analytics.recordPurchase(order))count++;return count;
}
