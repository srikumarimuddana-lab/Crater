import { describe, expect, it } from 'vitest';
import { createMemoryCmsRepository } from '@/lib/content/cms/repository';
import { validateContent, defaultsFor } from '@/lib/content/cms/schema';

describe('CMS publishing', () => {
  it('serializes publication before a competing editor and never publishes a stale selection', async () => {
    const published: string[] = [];
    const repo = createMemoryCmsRepository(async data => { published.push(data.heroTitle); });
    await repo.save('home', 0, { ...defaultsFor('home'), heroTitle: 'First' }, 'owner');
    const results = await Promise.allSettled([
      repo.publish('home', 1, 'owner'),
      repo.save('home', 1, { ...defaultsFor('home'), heroTitle: 'Stale' }, 'editor'),
      repo.publish('home', 1, 'owner'),
    ]);
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected', 'rejected']);
    expect(published).toEqual(['First']);
    expect((await repo.read('home')).published?.heroTitle).toBe('First');
  });
  it('keeps a draft private until published and detects stale editors', async () => {
    const repo = createMemoryCmsRepository();
    const draft = { ...defaultsFor('home'), heroTitle: 'A new ritual' };
    await repo.save('home', 0, draft, 'owner');
    expect((await repo.read('home')).published).toBeNull();
    await expect(repo.save('home', 0, draft, 'other')).rejects.toThrow('changed');
    await repo.publish('home', 1, 'owner');
    expect((await repo.read('home')).published?.heroTitle).toBe('A new ritual');
    await repo.save('home', 2, { ...draft, heroTitle: 'Unpublished' }, 'owner');
    expect((await repo.read('home')).published?.heroTitle).toBe('A new ritual');
    expect((await repo.history('home')).length).toBe(3);
  });
  it('rejects executable links and unknown editable fields', () => {
    expect(() => validateContent('home', { ...defaultsFor('home'), heroLink: 'javascript:alert(1)' })).toThrow();
    expect(() => validateContent('home', { ...defaultsFor('home'), apiSecret: 'oops' })).toThrow();
  });
  it('allows only owned media URLs rather than remote tracking images', () => {
    expect(() => validateContent('home', { ...defaultsFor('home'), heroImage: 'https://example.com/tracker' })).toThrow();
    expect(validateContent('home', { ...defaultsFor('home'), heroImage: '/remedy/hero-model.png' }).heroImage).toBe('/remedy/hero-model.png');
  });
});
