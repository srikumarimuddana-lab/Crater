import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultsFor } from '@/lib/content/cms/schema';
import { JOURNAL_STORIES } from '@/lib/content/cms/journal-model';
const {returned}=vi.hoisted(()=>({returned:{values:undefined as Record<string,string>|undefined}}));
vi.mock('@/components/admin/form',()=>({useFormValues:()=>returned.values}));
beforeEach(()=>{returned.values=undefined;});
vi.mock('@/components/page-shell',()=>({PageShell:({children}:{children:unknown})=>children}));
import { ContentPageBody } from '@/components/content-page';
import { ContentImage } from '@/components/content-image';
import { ContentImageField } from '@/components/admin/content-image-field';
import { RemedyJournal, RemedyWhy } from '@/components/remedy-home';
const html=<P extends object>(component:ComponentType<P>,props:P)=>renderToStaticMarkup(createElement(component,props));
describe('rendered page completion',()=>{
  it('renders paragraph breaks, published branding and focal position as safe HTML',()=>{
    const markup=html(ContentPageBody,{content:{...defaultsFor('about'),body:'First paragraph.\n\n<script>safe text</script>',imagePosition:'25 75'},brand:'Edited brand'});
    expect(markup).toContain('Edited brand');
    expect(markup).toContain('<p>First paragraph.</p><p>&lt;script&gt;safe text&lt;/script&gt;</p>');
    expect(markup).toContain('object-position:25% 75%');
  });
  it('renders bounded native focal sliders and an image choice that can be submitted without JS',()=>{
    const markup=html(ContentImageField,{name:'heroImage',label:'Hero portrait',image:'/remedy/hero-model.png',position:'20 80',options:[{value:'/remedy/hero-model.png',label:'Original image'}]});
    expect(markup).toContain('name="heroImagePositionX"');expect(markup).toContain('name="heroImagePositionY"');
    expect(markup).toContain('object-position:20% 80%');expect(markup).toContain('min="0" max="100"');
    expect(markup).toContain('name="heroImage"');
  });
  it('retains the submitted image and native crop after a server validation error',()=>{
    returned.values={heroImage:'/remedy/detail.jpg',heroImagePosition:'50 50',heroImagePositionX:'15',heroImagePositionY:'95'};
    const markup=html(ContentImageField,{name:'heroImage',label:'Hero portrait',image:'/remedy/hero-model.png',position:'50 50',options:[{value:'/remedy/hero-model.png',label:'Original'},{value:'/remedy/detail.jpg',label:'Chosen'}]});
    expect(markup).toContain('src="/remedy/detail.jpg"');expect(markup).toContain('object-position:15% 95%');
  });
  it('omits optional images rather than requesting the current page as an empty image source',()=>{
    expect(html(ContentImage,{content:{image:''},field:'image',alt:'Optional'})).toBe('');
  });
  it('connects each home story card to its dedicated article with the current published title',()=>{
    const articles=JOURNAL_STORIES.map(story=>({...story,href:`/journal/${story.slug}`,content:{...defaultsFor(story.key),title:`Edited ${story.key}`}}));
    const markup=html(RemedyJournal,{c:defaultsFor('home'),articles});
    for(const article of articles){expect(markup).toContain(`href="${article.href}"`);expect(markup).toContain(article.content.title);}
    expect(markup).not.toContain('/journal#article-');
  });
  it('renders philosophy statements as separate items',()=>{
    const markup=html(RemedyWhy,{c:{...defaultsFor('home'),whyText:'First statement\nSecond statement'}});
    expect(markup).toContain('<h3>First statement</h3>');expect(markup).toContain('<h3>Second statement</h3>');
  });
});
