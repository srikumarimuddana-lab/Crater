import { describe, expect, it, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { analyticsPath, validateEvent, coarseSource, type ClientEvent, type StoredEvent } from '@/lib/analytics/schema';
import { analyticsRepository } from '@/lib/analytics/repository';
import { summarizeTraffic, dateRange, readSales } from '@/lib/analytics/report';
import { createMemoryRepository, memoryStateOf } from '@/lib/commerce/memory-repository';
import { resetRepositoryForTests } from '@/lib/commerce/repository-factory';
import { POST } from '@/app/api/analytics/route';
import type { OrderRecord } from '@/lib/commerce/records';
const sid=randomUUID();
const event=(overrides:Partial<ClientEvent>={}):ClientEvent=>({id:randomUUID(),sessionId:sid,consent:true,name:'page_view',path:'/',device:'desktop',source:'direct',clickId:null,...overrides});
const stored=(overrides:Partial<StoredEvent>={}):StoredEvent=>({id:randomUUID(),sessionId:sid,name:'page_view',path:'/',device:'desktop',source:'direct',clickId:null,mode:'stripe-test',occurredAt:'2026-10-14T12:00:00.000Z',orderId:null,...overrides});

describe('analytics privacy schema',()=>{
  it('requires explicit consent and rejects purchase claims and unregistered fields/clicks',()=>{
    expect(validateEvent(event()).ok).toBe(true);
    for(const patch of [{consent:false},{consent:undefined},{name:'purchase'},{name:'begin_checkout'},{email:'someone@example.com'},{value:'typed text'},{clickId:'arbitrary.label'},{name:'cta_click'}])expect(validateEvent({...event(),...patch}).ok).toBe(false);
  });
  it('excludes admin and query strings, and groups dynamic paths before transmission',()=>{
    expect(analyticsPath('/admin/orders')).toBeNull();
    expect(analyticsPath('/cart?email=private@example.com')).toBeNull();
    expect(analyticsPath('/products/a-private-slug')).toBe('/products/[product]');
    expect(validateEvent(event({path:'/products/a-private-slug'})).ok).toBe(false);
    expect(validateEvent(event({path:'/products/[product]'})).ok).toBe(true);
  });
  it('uses only coarse source categories',()=>{
    expect(coarseSource('https://google.com/search?q=private','https://shop.test')).toBe('search');
    expect(coarseSource('https://shop.test/private?token=secret','https://shop.test')).toBe('internal');
    expect(coarseSource('https://person.example/private','https://shop.test')).toBe('referral');
  });
});
describe('analytics persistence and report definitions',()=>{
  it('deduplicates repeated events and separates modes',async()=>{
    const repo=analyticsRepository(createMemoryRepository());const e=event();
    expect(await repo.ingest(e,'stripe-test')).toBe('accepted');
    expect(await repo.ingest(e,'stripe-test')).toBe('duplicate');
    expect((await repo.events(new Date(0),new Date('2099-01-01'),'stripe-test')).length).toBe(1);
    expect((await repo.events(new Date(0),new Date('2099-01-01'),'stripe-live')).length).toBe(0);
  });
  it('bounds a session budget and permits retry of a duplicate',async()=>{
    const repo=analyticsRepository(createMemoryRepository());const at=new Date('2026-10-14T12:00:00Z');const first=event();await repo.ingest(first,'fixture',at);
    for(let i=1;i<120;i++)await repo.ingest(event(),'fixture',at);
    expect(await repo.ingest(event(),'fixture',at)).toBe('limited');
    expect(await repo.ingest(first,'fixture',at)).toBe('duplicate');
    expect(await repo.ingest(event(),'fixture',new Date(+at+60000))).toBe('accepted');
  });
  it('uses observed page-view sessions for conversion and never lets client event volume become revenue',()=>{
    const other=randomUUID();const noView=randomUUID();
    const result=summarizeTraffic([stored(),stored(),stored({sessionId:other}),stored({name:'purchase',orderId:1}),stored({name:'purchase',orderId:2}),stored({name:'purchase',orderId:3,sessionId:noView})]);
    expect(result.pageViews).toBe(3);expect(result.sessions).toBe(2);expect(result.convertedSessions).toBe(1);expect(result.conversion).toBe(.5);expect(result.purchases).toBe(3);
    expect(summarizeTraffic([]).conversion).toBeNull();
  });
  it('uses only paid orders in the selected payment mode for sales',async()=>{
    const commerce=createMemoryRepository();
    const base={id:1,number:1001,checkoutId:'checkout',stripeSessionId:'cs_test_123',financialStatus:'PAID',subtotalMinor:2000,shippingMinor:500,taxMinor:100,totalMinor:2600,processedAt:'2026-10-14T12:00:00Z',lines:[],fulfilmentStatus:'UNFULFILLED'} as unknown as OrderRecord;
    memoryStateOf(commerce).orders.push(base,{...base,id:2,stripeSessionId:'cs_live_123'},{...base,id:3,financialStatus:'PENDING'});
    const result=await readSales(commerce,new Date('2026-10-01'),new Date('2026-11-01'),'stripe-test');
    expect(result.orders).toBe(1);expect(result.grossMinor).toBe(2000);expect(result.taxMinor).toBe(100);
  });
  it('retains checkout attribution only for known recent sessions and forgets it on withdrawal',async()=>{
    const commerce=createMemoryRepository();const repo=analyticsRepository(commerce);const at=new Date('2026-10-14T12:00:00Z');
    memoryStateOf(commerce).checkouts.set('checkout',{id:'checkout',status:'session_created',stripeSessionId:'cs_test_checkout'} as never);
    expect(await repo.attachCheckout('checkout',sid,'stripe-test',at)).toBe(false);
    await repo.ingest(event(),'stripe-test',at);
    expect(await repo.attachCheckout('checkout',sid,'stripe-test',at)).toBe(true);
    expect(await repo.attachCheckout('checkout',sid,'stripe-test',at)).toBe(false);
    expect((await repo.events(new Date(0),new Date('2099-01-01'),'stripe-test')).filter(e=>e.name==='begin_checkout')).toHaveLength(1);
    const order={id:1,checkoutId:'checkout',financialStatus:'PAID',processedAt:at.toISOString()} as OrderRecord;
    memoryStateOf(commerce).orders.push(order);
    expect(await repo.recordPurchase(order)).toBe(true);expect(await repo.recordPurchase(order)).toBe(false);
    memoryStateOf(commerce).checkouts.set('next',{id:'next',status:'session_created',stripeSessionId:'cs_test_next'} as never);
    await repo.attachCheckout('next',sid,'stripe-test',at);await repo.forgetSession(sid);
    expect(await repo.recordPurchase({...order,id:2,checkoutId:'next'})).toBe(false);
  });
  it('bounds reporting dates and retention',async()=>{
    const now=new Date('2026-10-14T12:00:00Z');expect(dateRange(undefined,undefined,now).from).toBe('2026-09-15');
    expect(()=>dateRange('2026-01-01','2026-10-14',now)).toThrow(/90 days/);
    expect(()=>dateRange('2026-10-14','2026-10-01',now)).toThrow();
    const repo=analyticsRepository(createMemoryRepository());await repo.ingest(event(),'fixture',new Date('2026-01-01'));await repo.prune(now);
    expect(await repo.events(new Date(0),now,'fixture')).toEqual([]);
  });
});
describe('public ingestion boundary',()=>{
  beforeEach(()=>{resetRepositoryForTests();});
  const request=(body:unknown,extras:Record<string,string>={})=>new Request('https://shop.test/api/analytics',{method:'POST',headers:{origin:'https://shop.test','content-type':'application/json',cookie:`crater_analytics=granted; crater_analytics_session=${sid}`,...extras},body:JSON.stringify(body)});
  it('requires consent cookie, same-origin and bounded JSON',async()=>{
    expect((await POST(request(event(),{cookie:''}))).status).toBe(204);
    expect((await POST(request(event(),{origin:'https://attacker.test'}))).status).toBe(403);
    expect((await POST(request({text:'x'.repeat(3000)}))).status).toBe(413);
    expect((await POST(request({...event(),name:'purchase'}))).status).toBe(400);
    expect((await POST(request(event(),{'user-agent':'Googlebot'}))).status).toBe(204);
    expect((await POST(request(event(),{dnt:'1'}))).status).toBe(204);
  });
});
