import { test,expect } from '@playwright/test';
test.use({javaScriptEnabled:false});
test('contact works as a native POST without putting private details in the URL',async({page})=>{
  await page.goto('/contact');const form=page.locator('form[action="/api/contact"]');
  await expect(form).toHaveAttribute('method','post');
  await form.getByLabel('Your email').fill(`native-${Date.now()}@example.com`);
  await form.getByLabel('Subject',{exact:true}).fill('Native contact test');
  await form.getByLabel('Message',{exact:true}).fill('Private message sent in the request body.');
  const response=page.waitForResponse(r=>r.url().endsWith('/api/contact')&&r.request().method()==='POST');
  await form.getByRole('button',{name:'Send message'}).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByRole('heading',{name:'Thank you'})).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Your message is with our team');
  expect(new URL(page.url()).search).toBe('');
});
test('newsletter native POST requires consent and honestly reports unavailable delivery',async({page})=>{
  await page.goto('/contact');const form=page.locator('form[action="/api/consent"]');
  await expect(form).toHaveAttribute('method','post');
  await form.locator('input[name="email"]').fill('native-newsletter@example.com');
  const consent=form.getByRole('checkbox',{name:/I agree to receive email updates/});
  const submit=form.getByRole('button',{name:'Subscribe'});
  await expect(consent).toHaveAttribute('required','');
  // Exercise the native required-field validation and keyboard path. Pointer action
  // stability polling can stall during native smooth scrolling when JS is disabled.
  await submit.press('Enter');
  await expect(consent).toBeFocused();
  expect(new URL(page.url()).pathname).toBe('/contact');
  await consent.press('Space');
  await expect(consent).toBeChecked();
  const response=page.waitForResponse(r=>r.url().endsWith('/api/consent')&&r.request().method()==='POST');
  await submit.press('Enter');
  const submitted=await response;
  expect(new URLSearchParams(submitted.request().postData()??'').get('consent')).toBe('true');
  expect(submitted.status()).toBe(503);
  await expect(page.getByRole('heading',{name:'Submission not completed'})).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Email subscriptions are not available');
  expect(new URL(page.url()).search).toBe('');
});
