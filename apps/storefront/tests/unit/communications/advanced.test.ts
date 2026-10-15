import { describe,it,expect,vi } from 'vitest';
import { createMemoryOperationsStore } from '@/lib/operations/store';
import { createCommunications,SendFailure } from '@/lib/communications/service';
import { createCrm } from '@/lib/crm/service';
import { confirmationToken,verifyConfirmation } from '@/lib/communications/consent';
const input={eventKey:'paid:1',channel:'email' as const,recipient:'sam@example.com',templateKey:'order_paid',variables:{order:'#1'},mode:'test' as const};
describe('outbox failure recovery',()=>{
  it('multiple workers cannot claim the same job',async()=>{const store=createMemoryOperationsStore();const service=createCommunications(store);await service.enqueueNotification(input);const send=vi.fn(async()=>({providerId:'em_1'}));await Promise.all([service.processNotifications(send),service.processNotifications(send)]);expect(send).toHaveBeenCalledTimes(1);});
  it('replays early callbacks after provider acceptance is persisted',async()=>{const store=createMemoryOperationsStore();const service=createCommunications(store);await service.enqueueNotification(input);await service.processNotifications(async()=>{await service.deliveryEvent({eventId:'early',providerId:'em_1',status:'delivered'});return {providerId:'em_1'};});expect((await store.read()).jobs[0].status).toBe('delivered');});
  it('retries definite throttling with a delay, but never automatically retries unknown outcomes',async()=>{let now=new Date('2026-01-01T00:00:00Z');const store=createMemoryOperationsStore();const service=createCommunications(store,()=>now);await service.enqueueNotification(input);await service.processNotifications(async()=>{throw new SendFailure('throttle','retry');});const send=vi.fn(async()=>({providerId:'em_1'}));await service.processNotifications(send);expect(send).not.toHaveBeenCalled();now=new Date('2026-01-01T01:00:00Z');await service.processNotifications(send);expect(send).toHaveBeenCalledTimes(1);});
  it('rolls back state when a transaction rejects',async()=>{const store=createMemoryOperationsStore();await expect(store.mutate(s=>{s.inboundIds.push('x');throw new Error('rollback');})).rejects.toThrow('rollback');expect((await store.read()).inboundIds).toEqual([]);});
  it('cannot overwrite a stale template',async()=>{const service=createCommunications(createMemoryOperationsStore());await service.saveTemplate({key:'order_paid',channel:'email',subject:'A',body:'A',expectedVersion:1});await expect(service.saveTemplate({key:'order_paid',channel:'email',subject:'B',body:'B',expectedVersion:1})).rejects.toThrow('changed');});
});
describe('consent and campaigns',()=>{
  it('queueing a campaign is explicit, consent-filtered and idempotent',async()=>{const store=createMemoryOperationsStore();const service=createCommunications(store);const crm=createCrm(store);const c=await crm.recordCustomerOrder({orderId:'1',email:input.recipient,totalMinor:1000,currency:'CAD',mode:'test',occurredAt:new Date().toISOString()});await crm.recordConsent({customerId:c.id,channel:'email',purpose:'marketing',granted:true,source:'verified',wordingVersion:'1',actor:'staff'});const campaign=await service.saveCampaign({name:'Launch',subject:'Welcome',body:'Hello {{name}}',mode:'test'},'staff');expect((await store.read()).jobs).toHaveLength(0);await service.sendCampaign(campaign.id,'staff');await service.sendCampaign(campaign.id,'staff');expect((await store.read()).jobs).toHaveLength(1);});
  it('deduplicates incoming SMS and enforces STOP before consent',async()=>{const store=createMemoryOperationsStore();const crm=createCrm(store);const event={eventId:'SM_1',channel:'sms' as const,recipient:'+13065550123',subject:'SMS',body:'STOP'};await crm.inbound(event);await crm.inbound(event);const state=await store.read();expect(state.conversations[0].messages).toHaveLength(1);expect(state.suppressions).toHaveLength(1);});
  it('uses expiring, customer-bound confirmation signatures',()=>{const now=Date.now(),expires=String(now+3600000),token=confirmationToken('c1',expires,'secret');expect(verifyConfirmation('c1',expires,token,'secret',now)).toBe(true);expect(verifyConfirmation('c2',expires,token,'secret',now)).toBe(false);expect(verifyConfirmation('c1',expires,token,'secret',now+7200000)).toBe(false);});
});
describe('CRM order snapshot protection',()=>{
  it('catch-up never regresses confirmed refund totals or creates a second customer link',async()=>{const store=createMemoryOperationsStore();const crm=createCrm(store);const order={orderId:'1',email:'sam@example.com',totalMinor:1000,refundedMinor:400,currency:'CAD',mode:'test' as const,occurredAt:new Date().toISOString()};await crm.recordCustomerOrder(order);await crm.recordCustomerOrder({...order,email:'different@example.com',refundedMinor:0});const state=await store.read();expect(state.customers).toHaveLength(1);expect(state.customers[0].orders[0].refundedMinor).toBe(400);});
  it('one-use confirmation cannot reverse a later unsubscribe when replayed',async()=>{const store=createMemoryOperationsStore();const crm=createCrm(store);const c=await crm.recordCustomerOrder({orderId:'1',email:'sam@example.com',totalMinor:1000,currency:'CAD',mode:'test',occurredAt:new Date().toISOString()});const consent={customerId:c.id,channel:'email' as const,purpose:'marketing' as const,granted:true,source:'confirmed',wordingVersion:'1',actor:'customer',eventKey:'confirmation-id'};await crm.recordConsent(consent);await crm.recordConsent({...consent,eventKey:undefined,granted:false,source:'unsubscribe'});await crm.recordConsent(consent);expect((await store.read()).customers[0].consent.at(-1)?.granted).toBe(false);});
});
describe('reviewed customer merges',()=>{
  it('preserves financial links and source consent without expanding target permission',async()=>{
    const store=createMemoryOperationsStore();const crm=createCrm(store),comms=createCommunications(store);const order={totalMinor:1000,currency:'CAD',mode:'test' as const,occurredAt:new Date().toISOString()};
    const source=await crm.recordCustomerOrder({...order,orderId:'1',email:'source@example.com'});const target=await crm.recordCustomerOrder({...order,orderId:'2',email:'target@example.com'});
    await crm.recordConsent({customerId:source.id,channel:'email',purpose:'marketing',granted:true,source:'verified',wordingVersion:'1',actor:'staff'});
    await comms.enqueueNotification({...input,recipient:source.email,customerId:source.id,marketing:true});
    await crm.merge(source.id,target.id,source.email,target.email,'staff');await crm.merge(source.id,target.id,source.email,target.email,'staff');
    await crm.recordCustomerOrder({...order,orderId:'3',email:source.email});
    const state=await store.read();const merged=state.customers.find(c=>c.id===target.id)!;
    expect(merged.orders).toHaveLength(3);expect(merged.consent).toHaveLength(0);expect(state.customers.find(c=>c.id===source.id)?.mergedIntoId).toBe(target.id);expect(state.jobs[0].status).toBe('suppressed');expect(state.audit.filter(a=>a.action==='customer.merged')).toHaveLength(1);
    expect((await comms.enqueueNotification({...input,eventKey:'campaign:merged',recipient:target.email,customerId:target.id,marketing:true})).status).toBe('suppressed');
  });
  it('changing phone numbers does not transfer prior SMS consent',async()=>{
    const store=createMemoryOperationsStore();const crm=createCrm(store),comms=createCommunications(store);const c=await crm.recordCustomerOrder({orderId:'1',email:'sam@example.com',phone:'+13065550123',totalMinor:1000,currency:'CAD',mode:'test',occurredAt:new Date().toISOString()});
    await crm.recordConsent({customerId:c.id,channel:'sms',purpose:'transactional',granted:true,source:'verified',wordingVersion:'1',actor:'staff'});
    expect((await comms.enqueueNotification({...input,channel:'sms',recipient:'+13065550123',customerId:c.id})).status).toBe('pending');
    await crm.updateProfile(c.id,{name:'Sam',phone:'+13065550456',tags:''},'staff');
    expect((await comms.enqueueNotification({...input,eventKey:'paid:2',channel:'sms',recipient:'+13065550456',customerId:c.id})).status).toBe('suppressed');
  });
});
