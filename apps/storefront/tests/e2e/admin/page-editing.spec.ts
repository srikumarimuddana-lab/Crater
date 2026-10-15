import { test,expect } from './helpers';
test.use({role:'OWNER'});
const stories={
  'mobile-390':{key:'journal-article-1',slug:'making-room-for-a-daily-ritual'},
  'tablet-768':{key:'journal-article-2',slug:'a-routine-that-feels-like-you'},
  'desktop-1440':{key:'journal-article-3',slug:'the-art-of-slowing-down'},
};
test('article editing connects image crop, private preview, publication and public metadata',async({page,browser,baseURL},info)=>{
  test.skip(info.project.name!=='desktop-1440','The third article is reserved for this publication workflow so other viewport journeys can read their stories concurrently.');
  const story=stories['desktop-1440'];
  await page.goto(`/admin/content/${story.key}`);
  const original=await page.getByLabel('Article title',{exact:true}).inputValue();
  const title=`Complete article ${info.project.name}`;
  await page.getByLabel('Article title',{exact:true}).fill(title);
  await page.getByLabel('Article text (paragraphs separated by blank lines)',{exact:true}).fill('First article paragraph.\n\nSecond article paragraph.');
  await page.getByLabel('Search title',{exact:true}).fill(title);
  await page.getByRole('slider',{name:'Article cover image horizontal focal point'}).press('End');
  await page.getByRole('slider',{name:'Article cover image vertical focal point'}).press('Home');
  await expect(page.getByAltText('Article cover image crop preview')).toHaveCSS('object-position','100% 0%');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await expect(page.getByText('Draft saved. Preview it, then publish when ready.')).toBeVisible();
  const context=await browser.newContext({baseURL,storageState:{cookies:[],origins:[]}});
  try {
    const guest=await context.newPage();await guest.goto(`/journal/${story.slug}`);
    await expect(guest.getByRole('heading',{level:1})).not.toHaveText(title);
    await expect(guest).not.toHaveTitle(new RegExp(title));
    const popup=page.waitForEvent('popup');await page.getByRole('link',{name:'Preview draft ↗'}).click();
    const preview=await popup;await expect(preview.getByRole('heading',{level:1})).toHaveText(title);await expect(preview).not.toHaveTitle(new RegExp(title));await preview.close();
    await page.getByRole('button',{name:'Publish saved draft',exact:true}).click();
    await expect(page.getByText('Published. The storefront now uses this version.')).toBeVisible();
    await guest.reload();await expect(guest.getByRole('heading',{level:1})).toHaveText(title);await expect(guest).toHaveTitle(new RegExp(title));
    await expect(guest.locator('.r-content-body p')).toHaveText(['First article paragraph.','Second article paragraph.']);
    await expect(guest.locator('.r-content-hero img')).toHaveCSS('object-position','100% 0%');
  } finally {await context.close();}
  // Restore the title after the workflow so other journal assertions stay independent.
  await page.getByLabel('Article title',{exact:true}).fill(original);await page.getByLabel('Search title',{exact:true}).fill(original);
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByText('Draft saved. Preview it, then publish when ready.')).toBeVisible();
  await page.getByRole('button',{name:'Publish saved draft',exact:true}).click();
});
