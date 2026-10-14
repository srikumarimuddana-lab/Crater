import { describe, expect, it } from 'vitest';
import { createMemoryRepository, memoryStateOf } from '@/lib/commerce/memory-repository';
import { adminRepositoryFor } from '@/lib/admin/repository-factory';
import { createAdminServices } from '@/lib/admin/services';
import { createMemoryFinanceRepository } from '@/lib/finance/repository';
import type { OrderRecord } from '@/lib/commerce/records';
import type { Refund } from '@/lib/finance/types';
import { sessionFor } from './helpers';

describe('overview sales report integration',()=>{
  it('separates payment modes and subtracts only successful product refunds by success date',async()=>{
    const commerce=createMemoryRepository();const state=memoryStateOf(commerce);
    const order={id:1,number:1001,checkoutId:'checkout',stripeSessionId:'cs_test_overview',email:'buyer@example.test',financialStatus:'PAID',subtotalMinor:10000,shippingMinor:500,taxMinor:1000,totalMinor:11500,processedAt:'2026-10-14T01:00:00Z',lines:[],fulfilmentStatus:'UNFULFILLED'} as unknown as OrderRecord;
    state.orders.push(order,{...order,id:2,stripeSessionId:'cs_live_overview',subtotalMinor:90000});
    const finance=createMemoryFinanceRepository();state.ext.set('finance:repository',finance);
    const refund:Refund={id:'refund:1',paymentId:'order:1',mode:'test',currency:'CAD',amountMinor:2300,productMinor:2000,shippingMinor:100,taxMinor:200,reason:'Return',actor:'staff',status:'succeeded',providerId:'re_test1',createdAt:'2026-10-13T12:00:00Z',updatedAt:'2026-10-15T12:00:00Z',succeededAt:'2026-10-14T02:00:00Z',message:null};
    await finance.transaction('test',s=>{s.refunds.push(refund,{...refund,id:'refund:pending',status:'pending'},{...refund,id:'refund:earlier',succeededAt:'2026-10-13T23:59:59Z'});});
    await finance.transaction('live',s=>{s.refunds.push({...refund,id:'refund:live',mode:'live',productMinor:50000,amountMinor:50000});});
    const support=sessionFor({id:1,email:'support@example.test',role:'SUPPORT'});
    const svc=createAdminServices({commerce,admin:adminRepositoryFor(commerce),config:{timezone:'America/Regina'},getSession:async()=>support,now:()=>new Date('2026-10-14T12:00:00Z')});
    const test=await svc.overview.get('TODAY','stripe-test');
    expect(test).toMatchObject({timezone:'UTC',mode:'stripe-test',orders:1,grossSales:{amount:'100.00'},netSales:{amount:'80.00'},refunds:{amount:'23.00'},productRefunds:{amount:'20.00'},shipping:{amount:'5.00'},tax:{amount:'10.00'},fulfilmentBacklog:1});
    expect(test.salesByDay).toEqual([{date:'2026-10-14',orders:1,grossSales:{amount:'100.00',currencyCode:'CAD'}}]);
    expect(test).not.toHaveProperty('traffic');expect(test).not.toHaveProperty('customers');expect(test).not.toHaveProperty('refundRecords');
    expect(await svc.overview.get('TODAY','stripe-live')).toMatchObject({orders:1,grossSales:{amount:'900.00'},netSales:{amount:'400.00'}});
    expect(await svc.overview.get('TODAY','fixture')).toMatchObject({orders:0,grossSales:{amount:'0.00'},netSales:{amount:'0.00'},averageOrderValue:null});
  });
  it('denies a direct overview call without the overview capability',async()=>{
    const commerce=createMemoryRepository();const staff=sessionFor({id:1,email:'fulfilment@example.test',role:'FULFILMENT'});
    const svc=createAdminServices({commerce,admin:adminRepositoryFor(commerce),config:{timezone:'UTC'},getSession:async()=>staff});
    await expect(svc.overview.get('TODAY','stripe-live')).rejects.toMatchObject({code:'FORBIDDEN'});
  });
});
