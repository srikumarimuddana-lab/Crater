import 'server-only';
import { randomUUID } from 'node:crypto';
import { clean, findCustomer, marketingAllowed, normalizeEmail, validatePhone } from '@/lib/crm/service';
import type { Channel, DeliveryEvent, Mode, Notification, OperationsState, OperationsStore, Template } from '@/lib/operations/types';
export type EnqueueNotificationInput={eventKey:string;channel:Channel;recipient:string;templateKey:string;variables:Record<string,string>;mode:Mode;customerId?:string;marketing?:boolean;orderId?:string};
export class SendFailure extends Error { constructor(message:string,readonly outcome:'retry'|'failed'|'unknown'){super(message);} }
export type Sender=(job:Notification)=>Promise<{providerId:string}>;
const VARIABLES=new Set(['name','order','total','tracking','message','link','unsubscribe','amount','carrier']);
export function interpolate(template:string,values:Record<string,string>):string {
  return template.replace(/{{\s*([a-zA-Z_]+)\s*}}/g,(_,key:string)=>{if(!VARIABLES.has(key))throw new Error(`Unsupported template variable: ${key}`);return values[key]??'';});
}
export function suppressionReason(s:OperationsState,j:Pick<Notification,'channel'|'recipient'|'customerId'|'marketing'>):string|null {
  if(s.suppressions.some(v=>v.channel===j.channel&&v.recipient===j.recipient))return 'Recipient has opted out or delivery is suppressed.';
  const c=j.customerId?s.customers.find(c=>c.id===j.customerId):undefined;
  if(c?.anonymizedAt)return 'Customer has been anonymized.';
  if(c?.mergedIntoId)return 'Customer has been merged; verify the current contact before sending.';
  if(j.marketing&&c&&c.email!==j.recipient&&j.channel==='email')return 'Marketing consent is bound to the customer email address.';
  if(j.channel==='sms'&&c&&c.phone!==j.recipient)return 'SMS consent is bound to the customer phone number.';
  if(j.marketing&&(!c||!marketingAllowed(s,c,j.channel)))return 'Marketing consent is required.';
  if(j.channel==='sms'&&(!c||c.consent.filter(v=>v.channel==='sms'&&v.purpose===(j.marketing?'marketing':'transactional')).at(-1)?.granted!==true||c.consent.filter(v=>v.channel==='sms'&&v.purpose===(j.marketing?'marketing':'transactional')).at(-1)?.recipient!==j.recipient))return 'SMS consent is required for this phone number.';
  if(c&&c.consent.filter(v=>v.channel===j.channel&&v.purpose===(j.marketing?'marketing':'transactional')).at(-1)?.granted===false)return 'Recipient has withdrawn consent.';
  return null;
}
function enqueue(s:OperationsState,input:EnqueueNotificationInput,at:string,override?:Template):Notification {
  const recipient=input.channel==='email'?normalizeEmail(input.recipient):validatePhone(input.recipient);
  if(!['email','sms'].includes(input.channel)||!['test','live'].includes(input.mode))throw new Error('Invalid notification channel or mode.');
  clean(input.eventKey,300);
  const key=`${input.mode}:${input.eventKey}:${input.channel}`;const prior=s.jobs.find(j=>j.key===key);if(prior)return prior;
  const t=override??s.templates.find(t=>t.key===input.templateKey&&t.channel===input.channel);if(!t)throw new Error('Template not found.');
  if(input.customerId)findCustomer(s,input.customerId);
  const j:Notification={id:randomUUID(),key,eventKey:input.eventKey,channel:input.channel,recipient,templateKey:t.key,templateVersion:t.version,subject:interpolate(t.subject,input.variables),body:interpolate(t.body,input.variables),mode:input.mode,customerId:input.customerId,orderId:input.orderId,marketing:input.marketing??false,status:'pending',attempts:0,nextAttemptAt:at,leaseUntil:null,leaseToken:null,providerId:null,error:null,createdAt:at,updatedAt:at,history:[]};
  const reason=suppressionReason(s,j);if(reason){j.status='suppressed';j.error=reason;}j.history.push({at,status:j.status,detail:reason??'Queued'});s.jobs.push(j);return j;
}
function applyReceipt(s:OperationsState,event:DeliveryEvent):void {
  const j=s.jobs.find(j=>j.providerId===event.providerId);if(!j)return;
  // Terminal delivery cannot regress to an earlier status; bounce/complaint still suppress future sends.
  if(j.status!=='delivered'&&j.status!=='failed'&&j.status!=='suppressed'){j.status=event.status;j.updatedAt=event.at;j.history.push({at:event.at,status:event.status,detail:'Provider callback'});}
  if(event.suppression&&!s.suppressions.some(v=>v.channel===j.channel&&v.recipient===j.recipient))s.suppressions.push({channel:j.channel,recipient:j.recipient,reason:event.suppression,at:event.at});
}
export function createCommunications(store:OperationsStore,now=()=>new Date()) {
  return {
    enqueueNotification(input:EnqueueNotificationInput){return store.mutate(s=>enqueue(s,input,now().toISOString()));},
    async saveTemplate(input:{key:string;channel:Channel;subject:string;body:string;expectedVersion:number},actor='system'){
      if(!/^[a-z0-9_]{1,80}$/.test(input.key)||!['email','sms'].includes(input.channel))throw new Error('Invalid template key or channel.');
      const subject=clean(input.subject,180),body=clean(input.body,input.channel==='sms'?1500:20000);interpolate(subject,{});interpolate(body,{});
      return store.mutate(s=>{let t=s.templates.find(t=>t.key===input.key&&t.channel===input.channel);if((t?.version??0)!==input.expectedVersion)throw new Error('This template changed. Reload before saving.');
        if(!t){t={key:input.key,channel:input.channel,subject,body,version:0,updatedAt:now().toISOString()};s.templates.push(t);}Object.assign(t,{subject,body,version:t.version+1,updatedAt:now().toISOString()});s.audit.push({actor,action:'template.saved',target:`${t.key}:${t.channel}:${t.version}`,at:now().toISOString()});return t;});
    },
    async processNotifications(send:Sender,limit=20){
      let processed=0;
      for(let i=0;i<Math.min(limit,100);i++){
        const at=now().toISOString();
        const job=await store.mutate(s=>{
          for(const j of s.jobs.filter(j=>j.status==='processing'&&j.leaseUntil!==null&&j.leaseUntil<=at)){j.status='unknown';j.error='Worker lease expired after send began. Reconcile with provider before any resend.';j.updatedAt=at;j.history.push({at,status:'unknown',detail:j.error});}
          const j=s.jobs.find(j=>j.status==='pending'&&j.nextAttemptAt<=at);if(!j)return null;
          const reason=suppressionReason(s,j);if(reason){j.status='suppressed';j.error=reason;j.updatedAt=at;j.history.push({at,status:'suppressed',detail:reason});return {suppressed:true} as const;}
          j.status='processing';j.attempts++;j.leaseToken=randomUUID();j.leaseUntil=new Date(now().getTime()+60000).toISOString();j.updatedAt=at;j.history.push({at,status:'processing',detail:`Attempt ${j.attempts}`});return j;
        });
        if(!job)break;if('suppressed' in job)continue;
        let result:{providerId:string}|undefined;let failure:SendFailure|undefined;
        try{result=await send(job);}catch(e){failure=e instanceof SendFailure?e:new SendFailure('Provider outcome is unknown. Reconcile before retrying.','unknown');}
        await store.mutate(s=>{const j=s.jobs.find(j=>j.id===job.id);if(!j||j.leaseToken!==job.leaseToken)return;
          const at=now().toISOString();j.leaseUntil=null;j.leaseToken=null;j.updatedAt=at;
          if(result){j.providerId=result.providerId;j.status='accepted';j.error=null;j.history.push({at,status:'accepted',detail:'Provider accepted; delivery not yet confirmed.'});for(const e of s.providerEvents.filter(e=>e.providerId===j.providerId))applyReceipt(s,e);}
          else {j.error=failure?.message??'Unknown provider error';j.status=failure?.outcome==='retry'&&j.attempts<5?'pending':failure?.outcome==='unknown'?'unknown':'failed';j.nextAttemptAt=new Date(now().getTime()+Math.min(3600000,30000*2**j.attempts)).toISOString();j.history.push({at,status:j.status,detail:j.error});}
        });processed++;
      }return {processed};
    },
    async deliveryEvent(input:Omit<DeliveryEvent,'at'>){return store.mutate(s=>{if(s.providerEvents.some(e=>e.eventId===input.eventId))return false;const e={...input,at:now().toISOString()};s.providerEvents.push(e);applyReceipt(s,e);return true;});},
    async retryFailed(id:string,actor:string){await store.mutate(s=>{const j=s.jobs.find(j=>j.id===id);if(!j||j.status!=='failed')throw new Error('Only definitive failures can be retried. Unknown sends require provider reconciliation.');j.status='pending';j.attempts=0;j.nextAttemptAt=now().toISOString();s.audit.push({actor,action:'notification.retry',target:id,at:now().toISOString()});});},
    async reconcileUnknown(id:string,providerId:string,actor:string){if(!/^[A-Za-z0-9_-]{5,150}$/.test(providerId))throw new Error('Enter the provider message ID verified in the provider console.');await store.mutate(s=>{const j=s.jobs.find(j=>j.id===id);if(!j||j.status!=='unknown')throw new Error('Only unknown sends need reconciliation.');j.providerId=providerId;j.status='accepted';j.error=null;j.leaseToken=null;j.leaseUntil=null;j.updatedAt=now().toISOString();for(const e of s.providerEvents.filter(e=>e.providerId===providerId))applyReceipt(s,e);s.audit.push({actor,action:'notification.reconciled',target:id,at:now().toISOString()});});},
    async reply(conversationId:string,body:string,actor:string,mode:Mode,requestKey:string){clean(body,10000);clean(requestKey,100);return store.mutate(s=>{const c=s.conversations.find(c=>c.id===conversationId);if(!c)throw new Error('Conversation not found.');const j=enqueue(s,{eventKey:`reply:${c.id}:${requestKey}`,channel:c.channel,recipient:c.recipient,templateKey:'support_reply',variables:{message:body},mode,customerId:c.customerId??undefined},now().toISOString());if(!c.messages.some(m=>m.jobId===j.id))c.messages.push({id:randomUUID(),body,direction:'out',at:now().toISOString(),jobId:j.id});c.status='pending';s.audit.push({actor,action:'conversation.reply',target:c.id,at:now().toISOString()});return j;});},
    async saveCampaign(input:{name:string;subject:string;body:string;mode:Mode},actor:string){clean(input.name,150);clean(input.subject,180);clean(input.body,20000);if(!['test','live'].includes(input.mode))throw new Error('Invalid campaign mode.');interpolate(input.body,{});return store.mutate(s=>{const campaign={id:randomUUID(),...input,status:'draft' as const,createdAt:now().toISOString(),queuedAt:null,audienceCount:0};s.campaigns.push(campaign);s.audit.push({actor,action:'campaign.draft',target:campaign.id,at:now().toISOString()});return campaign;});},
    async sendCampaign(id:string,actor:string){return store.mutate(s=>{const c=s.campaigns.find(c=>c.id===id);if(!c)throw new Error('Campaign not found.');if(c.status==='queued')return c;
      let count=0;for(const customer of s.customers){const recipient=customer.email;if(suppressionReason(s,{recipient,channel:'email',customerId:customer.id,marketing:true}))continue;enqueue(s,{eventKey:`campaign:${id}:${customer.id}`,channel:'email',recipient,customerId:customer.id,templateKey:`campaign_${id}`,variables:{name:customer.name},mode:c.mode,marketing:true},now().toISOString(),{key:`campaign_${id}`,channel:'email',subject:c.subject,body:c.body,version:1,updatedAt:c.createdAt});count++;}
      c.status='queued';c.queuedAt=now().toISOString();c.audienceCount=count;s.audit.push({actor,action:'campaign.queued',target:id,at:now().toISOString()});return c;});},
  };
}
