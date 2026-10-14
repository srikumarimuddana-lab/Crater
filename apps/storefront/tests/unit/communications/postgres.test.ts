import { beforeEach,describe,it,expect } from 'vitest';
import { createPostgresOperationsStore } from '@/lib/operations/store';
import { createCommunications } from '@/lib/communications/service';
import { createCrm } from '@/lib/crm/service';
import { pgPoolOf } from '@/lib/commerce/postgres-repository';
import { makeRepo,skipUnavailable,closePoolsAfterAll } from '../helpers/repos';
import type { OperationsStore } from '@/lib/operations/types';
closePoolsAfterAll();
describe.skipIf(skipUnavailable('postgres'))('Postgres communications persistence',()=>{
  let store:OperationsStore;
  beforeEach(async()=>{store=createPostgresOperationsStore(pgPoolOf(await makeRepo('postgres')));});
  it('serializes duplicate enqueue and customer order mutations across independent services',async()=>{
    const a=createCommunications(store),b=createCommunications(store);const input={eventKey:'paid:1',channel:'email' as const,recipient:'sam@example.com',templateKey:'order_paid',variables:{},mode:'test' as const};
    const jobs=await Promise.all([a.enqueueNotification(input),b.enqueueNotification(input)]);expect(jobs[0].id).toBe(jobs[1].id);expect((await store.read()).jobs).toHaveLength(1);
    const crm=createCrm(store);const order={orderId:'1',email:'sam@example.com',totalMinor:1000,currency:'CAD',mode:'test' as const,occurredAt:new Date().toISOString()};await Promise.all([crm.recordCustomerOrder(order),crm.recordCustomerOrder(order)]);expect((await store.read()).customers[0].orders).toHaveLength(1);
  });
  it('rolls back a failed state mutation without losing earlier jobs',async()=>{
    const service=createCommunications(store);await service.enqueueNotification({eventKey:'paid:2',channel:'email',recipient:'sam@example.com',templateKey:'order_paid',variables:{},mode:'test'});
    await expect(store.mutate(s=>{s.jobs=[];throw new Error('abort');})).rejects.toThrow('abort');expect((await store.read()).jobs).toHaveLength(1);
  });
});
