import { beforeEach, expect, it, vi } from 'vitest';
import { createMemoryCmsRepository } from '@/lib/content/cms/repository';
import { defaultsFor,validateContent } from '@/lib/content/cms/schema';
const {save}=vi.hoisted(()=>({save:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:()=>undefined}));
vi.mock('@/lib/content/cms',()=>({saveDraft:save,getCmsRepository:vi.fn(),publishContent:vi.fn()}));
vi.mock('@/lib/media',()=>({getMediaRepository:vi.fn(),uploadImage:vi.fn(),updateMediaDetails:vi.fn()}));
vi.mock('@/lib/admin',()=>({requireAdmin:vi.fn()}));
import {saveContentAction} from '@/app/admin/_actions/content';
let repo:ReturnType<typeof createMemoryCmsRepository>;
beforeEach(()=>{repo=createMemoryCmsRepository();save.mockImplementation(async(key,version,data)=>repo.save(key,version,validateContent(key,data),'editor'));});
const form=()=>{const fd=new FormData();fd.set('key','home');fd.set('version','0');for(const [key,value]of Object.entries(defaultsFor('home')))fd.set(key,value);return fd;};
it('saves native focal slider values into the private draft and leaves the public page unchanged',async()=>{
  const fd=form();fd.set('heroImagePositionX','30');fd.set('heroImagePositionY','90');
  expect(await saveContentAction({status:'idle',errors:[]},fd)).toMatchObject({status:'success'});
  expect((await repo.read('home')).draft?.heroImagePosition).toBe('30 90');expect((await repo.read('home')).published).toBeNull();
});
it('rejects invalid coordinate pairs without changing the page',async()=>{
  const fd=form();fd.set('heroImagePositionX','150');fd.set('heroImagePositionY','40');
  expect(await saveContentAction({status:'idle',errors:[]},fd)).toMatchObject({status:'error'});
  expect((await repo.read('home')).version).toBe(0);
});
