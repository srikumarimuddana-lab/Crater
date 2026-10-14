import { afterEach, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

afterEach(() => vi.resetModules());

it('keeps a living memory repository accessible after a development module reload', async () => {
  const initial = await import('@/lib/commerce/memory-repository');
  const repo = initial.createMemoryRepository();
  const state = initial.memoryStateOf(repo);
  vi.resetModules();
  const reloaded = await import('@/lib/commerce/memory-repository');
  expect(reloaded.memoryStateOf(repo)).toBe(state);
});

it('keeps a living postgres repository pool accessible after a development module reload', async () => {
  const initial = await import('@/lib/commerce/postgres-repository');
  const pool = {} as Pool; // Construction and registry lookup make no queries.
  const repo = initial.createPostgresRepository(pool);
  vi.resetModules();
  const reloaded = await import('@/lib/commerce/postgres-repository');
  expect(reloaded.pgPoolOf(repo)).toBe(pool);
});
