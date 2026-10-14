import { describe,it,expect,vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyResendWebhook,verifyTwilioWebhook,createProviderSender } from '@/lib/communications/providers';
import { createMemoryOperationsStore } from '@/lib/operations/store';
import { createCommunications } from '@/lib/communications/service';
describe('provider boundaries',()=>{
  it('validates the published Svix signature and rejects stale/tampered requests',()=>{
    const h=new Headers({'svix-id':'msg_loFOjxBNrRLzqYUf','svix-timestamp':'1731705121','svix-signature':'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0='});
    const body='{"event_type":"ping","data":{"success":true}}',secret='whsec_plJ3nmyCDGBKInavdOK15jsl';
    expect(verifyResendWebhook(body,h,secret,1731705121000)).toBe(true);expect(verifyResendWebhook(body+' ',h,secret,1731705121000)).toBe(false);expect(verifyResendWebhook(body,h,secret,1731706121000)).toBe(false);
  });
  it('requires the exact Twilio URL and includes newly added parameters',()=>{
    const url='https://shop.example/api/webhooks/twilio';const params=new URLSearchParams({Body:'Hello',From:'+13065550123',NewField:'future'});
    const sig=createHmac('sha1','secret').update(url+'BodyHelloFrom+13065550123NewFieldfuture').digest('base64');
    expect(verifyTwilioWebhook(url,params,sig,'secret')).toBe(true);expect(verifyTwilioWebhook(url+'?other=1',params,sig,'secret')).toBe(false);
  });
  it('never makes a network call while sending is disabled or test recipient unapproved',async()=>{
    const comms=createCommunications(createMemoryOperationsStore());const job=await comms.enqueueNotification({eventKey:'paid:1',channel:'email',recipient:'sam@example.com',templateKey:'order_paid',variables:{},mode:'test'});const network=vi.fn();
    await expect(createProviderSender({},network)(job)).rejects.toThrow('paused');
    await expect(createProviderSender({COMMUNICATIONS_SEND_ENABLED:'true'},network)(job)).rejects.toThrow('Test recipient');expect(network).not.toHaveBeenCalled();
  });
});
