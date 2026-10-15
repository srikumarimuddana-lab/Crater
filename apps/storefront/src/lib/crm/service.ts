import 'server-only';
import { randomUUID,createHash } from 'node:crypto';
import type { Channel, Consent, Customer, Mode, OperationsState, OperationsStore } from '@/lib/operations/types';
export function normalizeEmail(value:string):string {
  const email=value.trim().toLowerCase(); if(email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.'); return email;
}
export function validatePhone(value:string):string {if(!/^\+[1-9]\d{7,14}$/.test(value)) throw new Error('Use an E.164 phone number, such as +13065550123.'); return value;}
export function clean(value:string,max=4000):string {const text=value.trim();if(!text||text.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))throw new Error(`Enter text between 1 and ${max} characters.`);return text;}
export function findCustomer(s:OperationsState,id:string):Customer {const c=s.customers.find(c=>c.id===id);if(!c)throw new Error('Customer not found.');return c;}
export function marketingAllowed(s:OperationsState,c:Customer,channel:Channel):boolean { return !c.anonymizedAt && !c.mergedIntoId && c.consent.filter(v=>v.channel===channel&&v.purpose==='marketing').at(-1)?.granted===true && c.consent.filter(v=>v.channel===channel&&v.purpose==='marketing').at(-1)?.recipient===(channel==='email'?c.email:c.phone); }
export type RecordCustomerOrderInput = {orderId:string;email:string;name?:string;phone?:string;totalMinor:number;refundedMinor?:number;currency:string;mode:Mode;occurredAt:string};
export function upsertCustomer(s:OperationsState,email:string,at:string,name='',phone:string|null=null):Customer {
  const normalized=normalizeEmail(email); let customer=s.customers.find(c=>c.email===normalized);
  while(customer?.mergedIntoId)customer=findCustomer(s,customer.mergedIntoId);
  if(!customer){customer={id:randomUUID(),email:normalized,name:name.slice(0,150),phone,tags:[],notes:[],consent:[],orders:[],createdAt:at};s.customers.push(customer);} return customer;
}
export function createCrm(store:OperationsStore,now=()=>new Date()) {
  return {
    async recordCustomerOrder(input:RecordCustomerOrderInput){
      if(!Number.isSafeInteger(input.totalMinor)||input.totalMinor<0||!Number.isSafeInteger(input.refundedMinor??0)||(input.refundedMinor??0)<0||(input.refundedMinor??0)>input.totalMinor)throw new Error('Invalid order amounts.');
      return store.mutate(s=>{const existing=s.customers.find(c=>c.orders.some(o=>o.orderId===input.orderId&&o.mode===input.mode));const c=existing??upsertCustomer(s,input.email,now().toISOString(),input.name,input.phone?validatePhone(input.phone):null);
        const order=c.orders.find(o=>o.orderId===input.orderId&&o.mode===input.mode);
        if(order)order.refundedMinor=Math.max(order.refundedMinor,input.refundedMinor??0);
        else c.orders.push({orderId:input.orderId,totalMinor:input.totalMinor,refundedMinor:input.refundedMinor??0,currency:input.currency,mode:input.mode,occurredAt:input.occurredAt}); return c;
      });
    },
    async addNote(id:string,body:string,actor:string){const value=clean(body);await store.mutate(s=>{findCustomer(s,id).notes.push({id:randomUUID(),body:value,actor,at:now().toISOString()});s.audit.push({actor,action:'customer.note',target:id,at:now().toISOString()});});},
    async updateProfile(id:string,input:{name:string;phone:string;tags:string},actor:string){
      const name=input.name.trim().slice(0,150),phone=input.phone.trim()?validatePhone(input.phone.trim()):null;
      const tags=[...new Set(input.tags.split(',').map(t=>t.trim()).filter(Boolean))]; if(tags.length>20||tags.some(t=>t.length>40))throw new Error('Use up to 20 tags, each under 40 characters.');
      await store.mutate(s=>{Object.assign(findCustomer(s,id),{name,phone,tags});s.audit.push({actor,action:'customer.profile',target:id,at:now().toISOString()});});
    },
    async recordConsent(input:Omit<Consent,'id'|'at'|'recipient'> & {customerId:string;eventKey?:string}){
      if(!['email','sms'].includes(input.channel)||!['transactional','marketing'].includes(input.purpose))throw new Error('Invalid consent channel or purpose.');
      clean(input.source,250);clean(input.wordingVersion,100);
      await store.mutate(s=>{const customer=findCustomer(s,input.customerId);if(customer.mergedIntoId||customer.anonymizedAt)throw new Error('Record consent on the active customer only.');const recipient=input.channel==='email'?customer.email:customer.phone;if(input.granted&&!recipient)throw new Error('Save a phone number before recording SMS consent.');if(input.eventKey&&customer.consent.some(c=>c.id===input.eventKey))return;customer.consent.push({id:input.eventKey??randomUUID(),recipient:recipient??undefined,channel:input.channel,purpose:input.purpose,granted:input.granted,source:input.source,wordingVersion:input.wordingVersion,actor:input.actor,at:now().toISOString()});s.audit.push({actor:input.actor,action:'customer.consent',target:input.customerId,at:now().toISOString()});});
    },
    async inbound(input:{eventId:string;channel:Channel;recipient:string;subject:string;body:string;customerId?:string;orderId?:string;occurredAt?:string}){
      const recipient=input.channel==='email'?normalizeEmail(input.recipient):validatePhone(input.recipient); const body=clean(input.body,10000);
      return store.mutate(s=>{
        if(s.inboundIds.includes(input.eventId))return null;s.inboundIds.push(input.eventId);if(input.occurredAt&&s.interactionPrivacy?.some(p=>p.emailHash===createHash('sha256').update(recipient).digest('hex')&&input.occurredAt!<=p.at))return null;
        const at=now().toISOString();
        const customer=input.customerId?findCustomer(s,input.customerId):input.channel==='email'?upsertCustomer(s,recipient,at):undefined;
        if(input.channel==='sms'&&/^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|REVOKE|OPTOUT)$/i.test(body.trim()))s.suppressions.push({channel:'sms',recipient,reason:'STOP',at});
        if(input.channel==='sms'&&/^(START|UNSTOP)$/i.test(body.trim()))s.suppressions=s.suppressions.filter(v=>!(v.channel==='sms'&&v.recipient===recipient&&v.reason==='STOP'));
        let thread=s.conversations.find(c=>c.channel===input.channel&&c.recipient===recipient&&c.status!=='closed');
        if(!thread){thread={id:randomUUID(),channel:input.channel,recipient,subject:input.subject.slice(0,200),owner:null,status:'open',customerId:customer?.id??null,orderId:input.orderId??null,createdAt:at,messages:[]};s.conversations.push(thread);}
        thread.messages.push({id:input.eventId,body,direction:'in',at});thread.status='open';return thread;
      });
    },
    async updateConversation(id:string,status:'open'|'pending'|'closed',owner:string,actor:string,customerId?:string,orderId?:string){
      if(!['open','pending','closed'].includes(status))throw new Error('Invalid conversation state.');
      await store.mutate(s=>{const c=s.conversations.find(c=>c.id===id);if(!c)throw new Error('Conversation not found.');if(customerId){const customer=findCustomer(s,customerId);if((c.channel==='email'?customer.email:customer.phone)!==c.recipient)throw new Error('The customer contact must match this sender before linking.');if(orderId&&!customer.orders.some(o=>o.orderId===orderId))throw new Error('Order is not linked to this customer.');c.customerId=customerId;c.orderId=orderId||null;}else if(customerId===''){c.customerId=null;c.orderId=null;}c.status=status;c.owner=owner.trim().slice(0,150)||null;s.audit.push({actor,action:'conversation.update',target:id,at:now().toISOString()});});
    },
    async merge(sourceId:string,targetId:string,expectedSourceEmail:string,expectedTargetEmail:string,actor:string){
      if(sourceId===targetId)throw new Error('Choose two different customers.');
      return store.mutate(s=>{const source=findCustomer(s,sourceId),target=findCustomer(s,targetId);
        if(source.mergedIntoId===targetId)return target;
        if(source.mergedIntoId||target.mergedIntoId||source.anonymizedAt||target.anonymizedAt)throw new Error('Reload the preview; a customer was already merged or anonymized.');
        if(source.email!==expectedSourceEmail||target.email!==expectedTargetEmail)throw new Error('Customer details changed. Reload the merge preview.');
        const orderKeys=new Set(target.orders.map(o=>`${o.mode}:${o.orderId}`));if(source.orders.some(o=>orderKeys.has(`${o.mode}:${o.orderId}`)))throw new Error('Both records reference the same order. Resolve the duplicate before merging.');
        const at=now().toISOString();target.orders.push(...source.orders);source.orders=[];target.tags=[...new Set([...target.tags,...source.tags])].slice(0,20);
        target.notes.push({id:randomUUID(),body:`Merged customer ${source.id}. Original contact and consent history remain in the archived record.`,actor,at});
        // Source consent never grants permission to the target address or phone.
        source.mergedIntoId=targetId;source.mergedAt=at;
        for(const j of s.jobs.filter(j=>j.customerId===sourceId&&j.status==='pending')){j.status='suppressed';j.error='Customer merged; source consent does not transfer to the target contact.';j.updatedAt=at;j.history.push({at,status:'suppressed',detail:j.error});}
        s.audit.push({actor,action:'customer.merged',target:`${sourceId}->${targetId}`,at});return target;
      });
    },
    async anonymize(id:string,actor:string){await store.mutate(s=>{findCustomer(s,id);const ids=new Set([id]);for(let pass=0;pass<s.customers.length;pass++)for(const c of s.customers)if(c.mergedIntoId&&ids.has(c.mergedIntoId))ids.add(c.id);const at=now().toISOString();(s.privacyRequests??=[]).push({id:randomUUID(),customerIds:[...ids],emails:s.customers.filter(c=>ids.has(c.id)).map(c=>c.email),status:'pending',at});for(const c of s.customers.filter(c=>ids.has(c.id))){const emailHash=createHash('sha256').update(c.email).digest('hex');(s.interactionPrivacy??=[]).push({emailHash,at});}for(const c of s.customers.filter(c=>ids.has(c.id))){c.email=`removed-${c.id}@invalid.example`;c.name='Anonymized customer';c.phone=null;c.notes=[];c.tags=[];c.anonymizedAt=at;for(const consent of c.consent)delete consent.recipient;}for(const j of s.jobs.filter(j=>j.customerId&&ids.has(j.customerId))){j.recipient='[removed]';j.body='[removed]';j.subject='[removed]';if(j.status==='pending')j.status='suppressed';}for(const t of s.conversations.filter(t=>t.customerId&&ids.has(t.customerId))){t.recipient='[removed]';t.messages=[];}s.audit.push({actor,action:'customer.anonymized',target:id,at});});},
  };
}
