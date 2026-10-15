import { describe, expect, it } from 'vitest';
import { defaultsFor, validateContent } from '@/lib/content/cms/schema';
import { homeSections, imagePosition, paragraphs } from '@/lib/content/cms/presentation';

describe('complete editable page presentation', () => {
  it('renders real paragraph breaks without treating text as markup', () => {
    expect(paragraphs('First paragraph.\n\nSecond paragraph.\r\n\r\n<script>text only</script>')).toEqual(['First paragraph.', 'Second paragraph.', '<script>text only</script>']);
  });
  it('preserves the original section sequence for existing saved pages', () => {
    expect(homeSections({})).toEqual(['story','ritual','feature','collection','moments','why','journal','community']);
  });
  it('applies a saved order and visibility while retaining the shopping collection', () => {
    const c=validateContent('home',{...defaultsFor('home'),sectionOrder:'collection,story,ritual,feature,moments,why,journal,community',storyVisible:'false'});
    expect(homeSections(c)).toEqual(['collection','ritual','feature','moments','why','journal','community']);
  });
  it.each(['story,story,collection','collection,<script>','community,story,ritual,feature,moments,why,journal'])('rejects invalid section ordering %s', order => {
    expect(()=>validateContent('home',{...defaultsFor('home'),sectionOrder:order})).toThrow();
  });
  it('bounds focal points and falls back safely for old or corrupt saved positions', () => {
    expect(imagePosition({},'heroImage')).toEqual({objectPosition:'50% 50%'});
    const c=validateContent('home',{...defaultsFor('home'),heroImagePosition:'20 85'});
    expect(imagePosition(c,'heroImage')).toEqual({objectPosition:'20% 85%'});
    expect(()=>validateContent('home',{...c,heroImagePosition:'101 -5'})).toThrow();
    expect(imagePosition({heroImagePosition:'url(https://bad.example)'},'heroImage')).toEqual({objectPosition:'50% 50%'});
  });
  it('exposes independent article fields and remaining storefront copy in the CMS', () => {
    expect(defaultsFor('journal-article-1')).toMatchObject({title:expect.any(String),body:expect.any(String),image:expect.any(String),seoTitle:expect.any(String)});
    expect(defaultsFor('home')).toMatchObject({storyButton:'Our story',scrollLabel:'Scroll to discover',searchLabel:'Find your ritual'});
    expect(defaultsFor('global')).toMatchObject({footerShopLabel:'Discover the collection',backToTopLabel:'Back to top',seoTitle:expect.any(String)});
  });
});
