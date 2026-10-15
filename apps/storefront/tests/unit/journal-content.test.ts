import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryCmsRepository } from '@/lib/content/cms/repository';
import { defaultsFor } from '@/lib/content/cms/schema';
const { requireEditor, getCms }=vi.hoisted(()=>({requireEditor:vi.fn(),getCms:vi.fn()}));
vi.mock('@/lib/admin',()=>({requireAdmin:requireEditor}));
vi.mock('@/lib/content/cms',()=>({getCmsRepository:getCms}));
import { getJournalArticle } from '@/lib/content/cms/journal';
let repo:ReturnType<typeof createMemoryCmsRepository>;
beforeEach(()=>{repo=createMemoryCmsRepository();getCms.mockResolvedValue(repo);requireEditor.mockReset();requireEditor.mockResolvedValue({staff:{id:'editor'}});});
describe('dedicated journal publication',()=>{
  it('retains existing homepage article edits until independent publication',async()=>{
    await repo.save('home',0,{...defaultsFor('home'),article0Title:'Existing story',article0Body:'Existing content'},'editor');
    await repo.publish('home',1,'editor');
    expect((await getJournalArticle('making-room-for-a-daily-ritual'))?.content).toMatchObject({title:'Existing story',body:'Existing content'});
  });
  it('seeds the authenticated article editor from a pending legacy home draft without exposing it publicly',async()=>{
    await repo.save('home',0,{...defaultsFor('home'),article0Title:'Pending legacy story',article0Body:'Pending legacy body'},'editor');
    expect((await getJournalArticle('making-room-for-a-daily-ritual'))?.content.title).not.toBe('Pending legacy story');
    expect((await getJournalArticle('making-room-for-a-daily-ritual','journal-article-1'))?.content).toMatchObject({title:'Pending legacy story',body:'Pending legacy body'});
  });
  it('keeps an independent draft private then publishes it under its canonical URL',async()=>{
    await repo.save('journal-article-1',0,{...defaultsFor('journal-article-1'),title:'Private draft'},'editor');
    expect((await getJournalArticle('making-room-for-a-daily-ritual'))?.content.title).not.toBe('Private draft');
    expect((await getJournalArticle('making-room-for-a-daily-ritual','journal-article-1'))?.content.title).toBe('Private draft');
    expect(requireEditor).toHaveBeenCalledWith('content:write');
    await repo.publish('journal-article-1',1,'editor');
    expect((await getJournalArticle('making-room-for-a-daily-ritual'))?.content.title).toBe('Private draft');
  });
  it('rejects unauthenticated previews and unknown article paths',async()=>{
    requireEditor.mockRejectedValueOnce(new Error('Sign in required'));
    await expect(getJournalArticle('making-room-for-a-daily-ritual','journal-article-1')).rejects.toThrow('Sign in');
    expect(await getJournalArticle('not-an-article')).toBeNull();
  });
});
