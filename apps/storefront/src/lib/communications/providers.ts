import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Notification } from '@/lib/operations/types';
import { SendFailure } from './service';

type Env=Record<string,string|undefined>;
const safeEqual=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export function verifyResendWebhook(body:string,headers:Headers,secret:string,now=Date.now()):boolean {
  const id=headers.get('svix-id'),stamp=headers.get('svix-timestamp'),signature=headers.get('svix-signature');
  if(!secret.startsWith('whsec_')||!id||!stamp||!/^\d+$/.test(stamp)||!signature||Math.abs(now/1000-Number(stamp))>300)return false;
  const expected=createHmac('sha256',Buffer.from(secret.slice(6),'base64')).update(`${id}.${stamp}.${body}`).digest('base64');
  return signature.split(' ').some(part=>part.startsWith('v1,')&&safeEqual(part.slice(3),expected));
}
/** Form-encoded webhooks only. Exact configured public URL, every received parameter. */
export function verifyTwilioWebhook(url:string,params:URLSearchParams,signature:string,authToken:string):boolean {
  if(!authToken||!signature||!url.startsWith('https://'))return false;
  let content=url;
  for(const key of [...new Set(params.keys())].sort())for(const value of [...new Set(params.getAll(key))].sort())content+=key+value;
  return safeEqual(createHmac('sha1',authToken).update(content).digest('base64'),signature);
}
const REQUIRED={email:['RESEND_API_KEY','RESEND_FROM','RESEND_REPLY_TO','RESEND_WEBHOOK_SECRET'],sms:['TWILIO_ACCOUNT_SID','TWILIO_API_KEY_SID','TWILIO_API_KEY_SECRET','TWILIO_AUTH_TOKEN','TWILIO_MESSAGING_SERVICE_SID','TWILIO_STATUS_CALLBACK_URL','TWILIO_INBOUND_WEBHOOK_URL']};
export function integrationHealth(env:Env=process.env){return (['email','sms'] as const).map(channel=>{const missing=REQUIRED[channel].filter(k=>!env[k]);return {channel,provider:channel==='email'?'Resend':'Twilio',missing,configured:missing.length===0,sendingEnabled:env.COMMUNICATIONS_SEND_ENABLED==='true',liveEnabled:env.COMMUNICATIONS_ALLOW_LIVE==='true',testRecipientsConfigured:Boolean(env.COMMUNICATIONS_TEST_RECIPIENTS),status:missing.length?'Missing configuration':env.COMMUNICATIONS_SEND_ENABLED==='true'?'Configured — delivery requires worker':'Configured — sending paused'};});}
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function unsubscribeToken(customerId:string,secret:string):string {return createHmac('sha256',secret).update(`unsubscribe:${customerId}`).digest('base64url');}
export function verifyUnsubscribe(customerId:string,token:string,secret:string):boolean {return Boolean(secret)&&safeEqual(unsubscribeToken(customerId,secret),token);}
export function createProviderSender(env:Env=process.env,fetcher:typeof fetch=fetch) {
  return async(job:Notification):Promise<{providerId:string}>=>{
    if(env.COMMUNICATIONS_SEND_ENABLED!=='true')throw new SendFailure('Sending is paused. Set COMMUNICATIONS_SEND_ENABLED only after provider setup.','failed');
    if(job.mode==='live'&&env.COMMUNICATIONS_ALLOW_LIVE!=='true')throw new SendFailure('Live messaging is disabled.','failed');
    const allowed=(env.COMMUNICATIONS_TEST_RECIPIENTS??'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
    if(job.mode==='test'&&!allowed.includes(job.recipient.toLowerCase()))throw new SendFailure('Test recipient is not in COMMUNICATIONS_TEST_RECIPIENTS.','failed');
    const missing=REQUIRED[job.channel].filter(k=>!env[k]);if(missing.length)throw new SendFailure(`Missing configuration: ${missing.join(', ')}.`,'failed');
    let url:string;let options:RequestInit;let text=job.body;
    if(job.channel==='email'){
      const headers:Record<string,string>={Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':createHash('sha256').update(job.key).digest('hex')};
      const mailHeaders:Record<string,string>={};
      if(job.marketing){
        if(!env.COMMUNICATIONS_UNSUBSCRIBE_SECRET||!(env.SITE_URL||env.NEXT_PUBLIC_SITE_URL)||!job.customerId||!env.COMMUNICATIONS_POSTAL_ADDRESS)throw new SendFailure('Marketing requires unsubscribe secret, site URL, and business postal address.','failed');
        const unsubscribe=`${env.SITE_URL||env.NEXT_PUBLIC_SITE_URL}/api/communications/unsubscribe?customer=${encodeURIComponent(job.customerId)}&token=${unsubscribeToken(job.customerId,env.COMMUNICATIONS_UNSUBSCRIBE_SECRET)}`;
        text+=`\n\n${env.COMMUNICATIONS_POSTAL_ADDRESS}\nUnsubscribe: ${unsubscribe}`;
        mailHeaders['List-Unsubscribe']=`<${unsubscribe}>`;mailHeaders['List-Unsubscribe-Post']='List-Unsubscribe=One-Click';
      }
      url='https://api.resend.com/emails';options={method:'POST',headers,body:JSON.stringify({from:env.RESEND_FROM,reply_to:env.RESEND_REPLY_TO,to:[job.recipient],subject:job.subject,text,html:`<!doctype html><html><body style="margin:0;background:#f7f8f3;font-family:Arial,sans-serif;color:#242924"><main style="max-width:600px;margin:24px auto;padding:32px;background:white;border-radius:20px"><h1 style="font-size:24px">${escape(job.subject)}</h1><div style="white-space:pre-wrap;line-height:1.6">${escape(text)}</div></main></body></html>`,headers:mailHeaders})};
    }else{
      url=`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID!)}/Messages.json`;
      options={method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${env.TWILIO_API_KEY_SID}:${env.TWILIO_API_KEY_SECRET}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({To:job.recipient,MessagingServiceSid:env.TWILIO_MESSAGING_SERVICE_SID!,Body:text,StatusCallback:env.TWILIO_STATUS_CALLBACK_URL!}).toString()};
    }
    let res:Response;try{res=await fetcher(url,{...options,signal:AbortSignal.timeout(15000)});}catch{throw new SendFailure('Provider connection ended without a confirmed result. Reconcile in provider console.','unknown');}
    if(!res.ok){if(res.status===429)throw new SendFailure('Provider rate limited the request.','retry');if(res.status>=500)throw new SendFailure('Provider returned an ambiguous server error. Reconcile before retrying.','unknown');throw new SendFailure(`Provider rejected request (HTTP ${res.status}). Check credentials, sender and recipient configuration.`,'failed');}
    let data:Record<string,unknown>;try{data=await res.json() as Record<string,unknown>;}catch{throw new SendFailure('Provider response was unreadable; reconciliation is required.','unknown');}
    const providerId=job.channel==='email'?data.id:data.sid;if(typeof providerId!=='string'||!providerId)throw new SendFailure('Provider accepted without a usable message ID.','unknown');return {providerId};
  };
}
