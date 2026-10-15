import 'server-only';
import type { Pool } from 'pg';
import { getRepository } from '@/lib/commerce/repository-factory';
import { memoryStateOf } from '@/lib/commerce/memory-repository';
import { pgPoolOf } from '@/lib/commerce/postgres-repository';
import type { OperationsState, OperationsStore, Template } from './types';

export function initialState():OperationsState {
  const templates:Template[] = [];
  const presets = [
    ['marketing_confirmation','Confirm your email subscription','Confirm that you want to receive marketing emails from Crater: {{link}}. If you did not request this, ignore this email.'],
    ['order_paid','Your order {{order}} is confirmed','Thank you. We received payment of {{total}} for order {{order}}.'],
    ['order_shipped','Shipment for order {{order}}','Items from order {{order}} have shipped. Carrier: {{carrier}}. Tracking: {{tracking}}'],
    ['order_refunded','Refund for order {{order}}','A refund of {{total}} has been confirmed for order {{order}}.'],
    ['support_reply','A reply from Crater','{{message}}'],
    ['staff_invitation','Your Crater staff invitation','You have been invited to Crater. {{link}}'],
    ['staff_reset','Reset your Crater password','Reset your password using this link: {{link}}'],
    ['low_stock','Stock requires attention','{{message}}'],
  ];
  for(const [key,subject,body] of presets) for(const channel of ['email','sms'] as const) templates.push({key,channel,subject,body,version:1,updatedAt:new Date(0).toISOString()});
  return {customers:[],jobs:[],templates,conversations:[],providerEvents:[],inboundIds:[],suppressions:[],campaigns:[],audit:[],rateLimits:{}};
}
/** Serial transactions are intentional: consent, campaign audience, dedupe, and leases change atomically. */
export function createMemoryOperationsStore():OperationsStore {
  let state = initialState(); let lock = Promise.resolve();
  return {
    async read(){await lock; return structuredClone(state);},
    async mutate<T>(fn:(s:OperationsState)=>T):Promise<T>{
      const prior=lock; let release!:()=>void; lock=new Promise<void>(r=>{release=r;}); await prior;
      try { const next=structuredClone(state); const result=fn(next); state=next; return structuredClone(result); } finally {release();}
    },
  };
}
export function createPostgresOperationsStore(pool:Pool):OperationsStore {
  return {
    async read(){ const result=await pool.query('select data from commerce.communications_state where id=1'); return result.rows[0]?.data as OperationsState ?? initialState(); },
    async mutate<T>(fn:(s:OperationsState)=>T):Promise<T>{
      const c=await pool.connect();
      try {
        await c.query('begin');
        await c.query('insert into commerce.communications_state(id,data) values(1,$1) on conflict(id) do nothing',[JSON.stringify(initialState())]);
        const row=await c.query('select data from commerce.communications_state where id=1 for update');
        const state=row.rows[0].data as OperationsState; const result=fn(state);
        await c.query('update commerce.communications_state set data=$1, updated_at=now() where id=1',[JSON.stringify(state)]);
        await c.query('commit'); return result;
      } catch(e){await c.query('rollback');throw e;} finally {c.release();}
    },
  };
}
export async function getOperationsStore():Promise<OperationsStore> {
  const repository=await getRepository();
  if(repository.kind==='postgres') return createPostgresOperationsStore(pgPoolOf(repository));
  const state=memoryStateOf(repository);const key='communications:store';
  let store=state.ext.get(key) as OperationsStore|undefined;
  if(!store){store=createMemoryOperationsStore();state.ext.set(key,store);}
  return store;
}
