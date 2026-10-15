import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { analyticsRepository } from '@/lib/analytics/repository';
import { readTraffic } from '@/lib/analytics/report';
import { pgPoolOf } from '@/lib/commerce/postgres-repository';
import { closePoolsAfterAll, makeRepo, TEST_DATABASE_URL } from './helpers/repos';
import type { ClientEvent } from '@/lib/analytics/schema';
closePoolsAfterAll();
describe.skipIf(!TEST_DATABASE_URL)('analytics Postgres persistence',()=>{
  it('deduplicates concurrent event retries and increments daily totals once',async()=>{
    const commerce=await makeRepo('postgres');const repo=analyticsRepository(commerce);
    const e:ClientEvent={id:randomUUID(),sessionId:randomUUID(),consent:true,name:'page_view',path:'/',device:'desktop',source:'direct',clickId:null};
    const at=new Date('2026-10-14T12:00:00Z');
    const results=await Promise.all(Array.from({length:5},()=>repo.ingest(e,'stripe-test',at)));
    expect(results.filter(r=>r==='accepted')).toHaveLength(1);
    const pool=pgPoolOf(commerce);
    expect(Number((await pool.query('select sum(event_count) as n from commerce.analytics_daily')).rows[0].n)).toBe(1);
    const traffic=await readTraffic(commerce,new Date('2026-10-14'),new Date('2026-10-15'),'stripe-test');
    expect(traffic.pageViews).toBe(1);expect(traffic.sessions).toBe(1);expect(traffic.conversion).toBe(0);
    expect((await readTraffic(commerce,new Date('2026-10-14'),new Date('2026-10-15'),'stripe-live')).sessions).toBe(0);
    await repo.prune(new Date('2027-02-01'));
    expect((await pool.query('select count(*)::int as n from commerce.analytics_events')).rows[0].n).toBe(0);
    expect(Number((await pool.query('select sum(event_count) as n from commerce.analytics_daily')).rows[0].n)).toBe(1);
  });
});
