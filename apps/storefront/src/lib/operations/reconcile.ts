import 'server-only';
import { getAdminRepository } from '@/lib/admin/repository-factory';
import type { OrderWithFulfilment } from '@/lib/admin/records';
import { memoryStateOf } from '@/lib/commerce/memory-repository';
import { pgPoolOf } from '@/lib/commerce/postgres-repository';
import { getFinance, modeForSession } from '@/lib/finance';
import type { Payment, Refund } from '@/lib/finance/types';
import type { OperationalState } from '@/lib/inventory-operations/repository';
import { getOperationsStore } from './store';
import type { Customer, OperationsStore } from './types';
import { createCommunications } from '@/lib/communications/service';
import { createCrm } from '@/lib/crm/service';

export type ShipmentSource={key:string;orderId:number;carrier:string;trackingNumber:string;occurredAt:string|null};
export type CommunicationSources={orders:OrderWithFulfilment[];payments:Payment[];refunds:Refund[];shipments:ShipmentSource[]};
function smsAllowedAt(customer:Customer,occurredAt:string|null):boolean {
  const consent=customer.consent.filter(c=>c.channel==='sms'&&c.purpose==='transactional').at(-1);
  return Boolean(!customer.anonymizedAt&&!customer.mergedIntoId&&customer.phone&&occurredAt&&consent?.granted&&consent.recipient===customer.phone&&consent.at<=occurredAt);
}
/** Pure source adapter seam: all inputs are authoritative durable records, never browser state. */
export async function reconcileCommunicationSources(sources:CommunicationSources,store:OperationsStore){
  const crm=createCrm(store),comms=createCommunications(store);let orders=0,refunds=0,shipments=0,anonymized=0;
  for(const order of sources.orders){
    const mode=modeForSession(order.stripeSessionId);
    if(!mode||!order.email||!['PAID','PARTIALLY_REFUNDED','REFUNDED'].includes(order.financialStatus))continue;
    const payment=sources.payments.find(p=>p.orderId===order.id&&p.mode===mode);
    const confirmedRefunds=payment?sources.refunds.filter(r=>r.paymentId===payment.id&&r.mode===mode&&r.status==='succeeded'):[];
    const currency=payment?.currency??'CAD';
    const customer=await crm.recordCustomerOrder({orderId:String(order.id),email:order.email,name:order.shippingAddress?.name??'',totalMinor:order.totalMinor,refundedMinor:confirmedRefunds.length?confirmedRefunds.reduce((n,r)=>n+r.amountMinor,0):order.financialStatus==='REFUNDED'?order.totalMinor:0,currency,mode,occurredAt:order.processedAt});
    // The order link is a durable privacy tombstone. Never recreate the erased contact from its order email.
    if(customer.anonymizedAt){anonymized++;continue;}
    const base={recipient:order.email,customerId:customer.id,orderId:String(order.id),mode};
    const total=`${currency} ${(order.totalMinor/100).toFixed(2)}`;
    async function notification(eventKey:string,templateKey:string,variables:Record<string,string>,occurredAt:string|null){
      await comms.enqueueNotification({...base,eventKey,channel:'email',templateKey,variables});
      if(smsAllowedAt(customer,occurredAt))await comms.enqueueNotification({...base,eventKey,channel:'sms',recipient:customer.phone!,templateKey,variables});
    }
    await notification(`order:${order.id}:paid`,'order_paid',{order:`#${order.number}`,total},order.processedAt);
    const partials=sources.shipments.filter(s=>s.orderId===order.id);
    if(partials.length){
      // The final partial shipment also creates a legacy fulfilment row. Only the shipment key may notify.
      await store.mutate(s=>{for(const j of s.jobs.filter(j=>j.mode===mode&&j.eventKey===`order:${order.id}:shipped`&&j.status==='pending')){j.status='suppressed';j.error='Superseded by the individual shipment notification.';j.updatedAt=new Date().toISOString();j.history.push({at:j.updatedAt,status:'suppressed',detail:j.error});}});
      for(const shipment of partials){await notification(`shipment:${shipment.key}`,'order_shipped',{order:`#${order.number}`,total,tracking:shipment.trackingNumber,carrier:shipment.carrier},shipment.occurredAt);shipments++;}
    }else if(order.fulfilment){
      await notification(`order:${order.id}:shipped`,'order_shipped',{order:`#${order.number}`,total,tracking:order.fulfilment.trackingNumber,carrier:order.fulfilment.carrier},order.fulfilment.fulfilledAt);shipments++;
    }
    for(const refund of confirmedRefunds){
      if(!refund.providerId)continue; // A confirmed provider identity is required for a long-lived refund event key.
      const amount=`${refund.currency} ${(refund.amountMinor/100).toFixed(2)}`;
      await notification(`refund:${refund.providerId}`,'order_refunded',{order:`#${order.number}`,total:amount,amount},refund.succeededAt??refund.updatedAt);refunds++;
    }
    orders++;
  }
  return {orders,refunds,shipments,anonymized};
}
/** Restart-safe catch-up scans every durable shipment, with no UI-list truncation. */
export async function reconcileOrderCommunications(){
  const {admin,commerce}=await getAdminRepository();const store=await getOperationsStore();const finance=await getFinance();
  const snapshots=[await finance.snapshot('test'),await finance.snapshot('live')];
  const payments=snapshots.flatMap(s=>s.payments),refunds=snapshots.flatMap(s=>s.refunds);
  let shipments:ShipmentSource[];
  if(commerce.kind==='memory'){
    const state=memoryStateOf(commerce);const inventory=state.ext.get('inventory-operations') as OperationalState|undefined;
    shipments=(inventory?.shipments??[]).map(s=>({...s,occurredAt:state.ext.get(`shipment-at:${s.key}`) as string|undefined??null}));
  }else{
    const rows=await pgPoolOf(commerce).query('select request_key,order_id,carrier,tracking_number,created_at from commerce.shipments order by created_at,request_key');
    shipments=rows.rows.map(r=>({key:String(r.request_key),orderId:Number(r.order_id),carrier:String(r.carrier),trackingNumber:String(r.tracking_number),occurredAt:r.created_at?new Date(r.created_at).toISOString():null}));
  }
  const result={orders:0,refunds:0,shipments:0,anonymized:0};let after:{processedAt:string;id:number}|null=null;
  for(;;){
    const rows=await admin.listOrders({first:100,after});const batch=rows.slice(0,100);
    const counts=await reconcileCommunicationSources({orders:batch,payments,refunds,shipments},store);
    for(const key of ['orders','refunds','shipments','anonymized'] as const)result[key]+=counts[key];
    if(rows.length<=100)break;const last=batch[batch.length-1];after={processedAt:last.processedAt,id:last.id};
  }
  return result;
}
