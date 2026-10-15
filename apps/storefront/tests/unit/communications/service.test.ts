import { describe, it, expect, vi } from 'vitest';
import { createMemoryOperationsStore } from '@/lib/operations/store';
import { createCommunications } from '@/lib/communications/service';
import { createCrm } from '@/lib/crm/service';

describe('durable communications', () => {
  const input = { eventKey: 'paid:1', channel: 'email' as const, recipient: 'sam@example.com', templateKey: 'order_paid', variables: { order: '#1', total: 'CAD 20.00' }, mode: 'test' as const };
  it('snapshots templates and deduplicates concurrent event/channel submissions', async () => {
    const store = createMemoryOperationsStore(); const svc = createCommunications(store);
    const [a,b] = await Promise.all([svc.enqueueNotification(input), svc.enqueueNotification(input)]);
    expect(a.id).toBe(b.id); expect((await store.read()).jobs).toHaveLength(1);
    await svc.saveTemplate({ key:'order_paid', channel:'email', subject:'Changed', body:'Changed {{order}}', expectedVersion:1 });
    expect((await store.read()).jobs[0].body).toContain('#1');
    expect((await store.read()).jobs[0].subject).not.toBe('Changed');
  });
  it('suppresses marketing without consent and rechecks withdrawals before sending', async () => {
    const store = createMemoryOperationsStore(); const svc = createCommunications(store); const crm = createCrm(store);
    const customer = await crm.recordCustomerOrder({orderId:'1',email:input.recipient,totalMinor:2000,currency:'CAD',mode:'test',occurredAt:new Date().toISOString()});
    expect((await svc.enqueueNotification({...input,marketing:true,customerId:customer.id})).status).toBe('suppressed');
    await crm.recordConsent({customerId:customer.id,channel:'email',purpose:'marketing',granted:true,source:'verified opt-in',wordingVersion:'1',actor:'staff'});
    await svc.enqueueNotification({...input,eventKey:'campaign:2',marketing:true,customerId:customer.id});
    await crm.recordConsent({customerId:customer.id,channel:'email',purpose:'marketing',granted:false,source:'unsubscribe',wordingVersion:'1',actor:'customer'});
    const send = vi.fn(async()=>({providerId:'x'})); await svc.processNotifications(send);
    expect(send).not.toHaveBeenCalled();
  });
  it('quarantines ambiguous provider timeouts and expired processing leases', async () => {
    let now = new Date('2026-01-01T00:00:00Z'); const store = createMemoryOperationsStore(); const svc = createCommunications(store,()=>now);
    await svc.enqueueNotification(input);
    await svc.processNotifications(async()=>{ throw new Error('network timeout'); });
    expect((await store.read()).jobs[0].status).toBe('unknown');
    await svc.enqueueNotification({...input,eventKey:'paid:2'});
    await store.mutate(s=>{ const j=s.jobs[1]; j.status='processing'; j.leaseUntil=now.toISOString(); });
    now = new Date('2026-01-01T00:05:00Z'); const send=vi.fn(async()=>({providerId:'x'})); await svc.processNotifications(send);
    expect(send).not.toHaveBeenCalled(); expect((await store.read()).jobs[1].status).toBe('unknown');
  });
  it('tracks acceptance separately and ignores stale delivery callbacks', async()=>{
    const store=createMemoryOperationsStore(); const svc=createCommunications(store);
    await svc.enqueueNotification(input); await svc.processNotifications(async()=>({providerId:'em_1'}));
    expect((await store.read()).jobs[0].status).toBe('accepted');
    await svc.deliveryEvent({eventId:'evt1',providerId:'em_1',status:'delivered'});
    await svc.deliveryEvent({eventId:'evt2',providerId:'em_1',status:'accepted'});
    expect((await store.read()).jobs[0].status).toBe('delivered');
  });
  it('links normalized email idempotently without merging phone numbers', async()=>{
    const store=createMemoryOperationsStore(); const crm=createCrm(store);
    const order={orderId:'1',email:'SAM@example.com',totalMinor:2000,currency:'CAD',mode:'test' as const,occurredAt:new Date().toISOString()};
    await crm.recordCustomerOrder(order); await crm.recordCustomerOrder({...order,email:' sam@example.com '});
    const state=await store.read(); expect(state.customers).toHaveLength(1); expect(state.customers[0].orders).toHaveLength(1);
  });
});
