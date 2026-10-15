import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
vi.mock('@/lib/admin',()=>({requireAdmin:async()=>({staff:{id:'owner',role:'OWNER'}})}));
vi.mock('@/components/page-shell',()=>({PageShell:({children}:{children:unknown})=>children}));
import { resetRepositoryForTests } from '@/lib/commerce/repository-factory';
import { getMediaRepository } from '@/lib/media';
import { defaultsFor } from '@/lib/content/cms/schema';
import { getCmsRepository,saveDraft,publishContent } from '@/lib/content/cms';
import { getPageMetadata } from '@/lib/content/cms/metadata';
import Home from '@/app/page';
import Article,{generateMetadata as articleMetadata} from '@/app/journal/[slug]/page';
beforeEach(()=>{vi.stubEnv('COMMERCE_DB','memory');vi.stubEnv('COMMERCE_PROVIDER','fixture');resetRepositoryForTests();});
afterEach(()=>vi.unstubAllEnvs());
describe('CMS to storefront workflows',()=>{
  it('keeps a selected image/text draft private then renders its published section order, title and crop',async()=>{
    const media=await getMediaRepository();const asset=await media.create({name:'Cover',alt:'Photo',mime:'image/webp',width:1,height:1,content:Buffer.from('bytes')});
    await saveDraft('home',0,{...defaultsFor('home'),heroTitle:'Published from the editor',heroImage:`/api/media/${asset.id}`,heroImagePosition:'30 90',storyVisible:'false',sectionOrder:'collection,story,ritual,feature,moments,why,journal,community'});
    const initial=renderToStaticMarkup(await Home({searchParams:Promise.resolve({})}));
    expect(initial).not.toContain('Published from the editor');expect((await media.get(asset.id))?.published).toBe(false);
    await publishContent('home',1);
    const published=renderToStaticMarkup(await Home({searchParams:Promise.resolve({})}));
    expect(published).toContain('Published from the editor');expect(published).toContain(`src="/api/media/${asset.id}"`);expect(published).toContain('object-position:30% 90%');
    expect(published).not.toContain('data-section="story"');expect(published.indexOf('data-section="collection"')).toBeLessThan(published.indexOf('data-section="ritual"'));expect((await media.get(asset.id))?.published).toBe(true);
  });
  it('keeps metadata published while rendering an authenticated article draft and supports restoration',async()=>{
    const props={params:Promise.resolve({slug:'making-room-for-a-daily-ritual'}),searchParams:Promise.resolve({preview:'journal-article-1'})};
    await saveDraft('journal-article-1',0,{...defaultsFor('journal-article-1'),title:'Draft article title',body:'First new paragraph.\n\nSecond new paragraph.',seoTitle:'Private SEO'});
    expect((await articleMetadata(props)).title).not.toContain('Private SEO');
    const preview=renderToStaticMarkup(await Article(props));expect(preview).toContain('Draft article title');expect(preview).toContain('<p>First new paragraph.</p><p>Second new paragraph.</p>');
    await publishContent('journal-article-1',1);expect((await articleMetadata(props)).title).toContain('Private SEO');
    await saveDraft('journal-article-1',2,{...defaultsFor('journal-article-1'),title:'Second draft',seoTitle:'Hidden second SEO'});
    expect((await articleMetadata(props)).title).not.toContain('Hidden second SEO');
    const repo=await getCmsRepository();const revision=(await repo.history('journal-article-1')).find(r=>r.version===1)!;
    await saveDraft('journal-article-1',3,revision.data);await publishContent('journal-article-1',4);
    const restored=renderToStaticMarkup(await Article({...props,searchParams:Promise.resolve({})}));expect(restored).toContain('Draft article title');expect(restored).not.toContain('Second draft');
  });
  it('does not publish a private image merely because its path appears as editable body text',async()=>{
    const media=await getMediaRepository();const asset=await media.create({name:'Private',alt:'Private photo',mime:'image/webp',width:1,height:1,content:Buffer.from('private')});
    await saveDraft('about',0,{...defaultsFor('about'),image:'',body:`/api/media/${asset.id}`});
    await publishContent('about',1);
    expect((await media.get(asset.id))?.published).toBe(false);
  });
  it('uses published global branding in page metadata without reading a pending brand change',async()=>{
    await saveDraft('global',0,{...defaultsFor('global'),brand:'New brand',brandSecond:'Care'});await publishContent('global',1);
    await saveDraft('global',2,{...defaultsFor('global'),brand:'Private brand'});
    const metadata=await getPageMetadata('about');expect(metadata.title).toContain('New brand Care');expect(metadata.title).not.toContain('Private brand');
  });
});
