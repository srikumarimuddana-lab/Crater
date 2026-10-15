import 'server-only';
import { getRepository } from '@/lib/commerce/repository-factory';
import { pgPoolOf } from '@/lib/commerce/postgres-repository';
import { getOperationsStore } from '@/lib/operations/store';
import { hash } from './validation';
export async function consumePublicLimit(
  scope: string,
  subject: string,
  limit: number,
  windowMs = 3600000,
): Promise<boolean> {
  const key = hash(`${scope}:${subject}`),
    now = Date.now(),
    repo = await getRepository();
  if (repo.kind === 'postgres') {
    const r = await pgPoolOf(repo).query(
      `insert into commerce.interaction_limits(key,start_ms,count) values($1,$2,1) on conflict(key) do update set count=case when interaction_limits.start_ms<=$2-$3 then 1 else interaction_limits.count+1 end,start_ms=case when interaction_limits.start_ms<=$2-$3 then $2 else interaction_limits.start_ms end returning count`,
      [key, now, windowMs],
    );
    return r.rows[0].count <= limit;
  }
  return (await getOperationsStore()).mutate((s) => {
    let v = s.rateLimits[key];
    if (!v || v.start <= now - windowMs)
      v = s.rateLimits[key] = { start: now, count: 0 };
    return ++v.count <= limit;
  });
}
