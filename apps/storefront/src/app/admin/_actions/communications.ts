'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin/session';
import { requireCommunications, type CommunicationsAccess } from '@/lib/communications/access';
import { getCommunications } from '@/lib/communications';
import { getCrm } from '@/lib/crm';
import { createProviderSender } from '@/lib/communications/providers';
import { reconcileCommerceEffects,runCommerceMaintenance } from '@/lib/operations/commerce';
import type { ActionResult } from '@/lib/communications/form';
import type { Channel, Mode } from '@/lib/operations/types';
const value=(fd:FormData,key:string)=>String(fd.get(key)??'');
async function perform(access:CommunicationsAccess,run:(actor:string)=>Promise<unknown>,message:string):Promise<ActionResult>{
  try{const session=await requireCommunications(access);if(access==='crm')await requireAdmin('customers:write');await run(session.staff.id);for(const path of ['/admin/customers','/admin/inbox','/admin/templates','/admin/campaigns','/admin/integrations'])revalidatePath(path,'layout');return {message};}
  catch(e){return {error:e instanceof Error?e.message:'The change could not be saved.'};}
}
export async function profileAction(_:ActionResult,fd:FormData){return perform('crm',async actor=>(await getCrm()).updateProfile(value(fd,'id'),{name:value(fd,'name'),phone:value(fd,'phone'),tags:value(fd,'tags')},actor),'Customer saved.');}
export async function noteAction(_:ActionResult,fd:FormData){return perform('crm',async actor=>(await getCrm()).addNote(value(fd,'id'),value(fd,'note'),actor),'Note added.');}
export async function consentAction(_:ActionResult,fd:FormData){return perform('crm',async actor=>(await getCrm()).recordConsent({customerId:value(fd,'id'),channel:value(fd,'channel') as Channel,purpose:value(fd,'purpose') as 'transactional'|'marketing',granted:value(fd,'granted')==='true',source:value(fd,'source'),wordingVersion:value(fd,'wordingVersion'),actor}),'Consent event recorded.');}
export async function anonymizeAction(_:ActionResult,fd:FormData){return perform('manage',async actor=>{if(value(fd,'confirmation')!=='ANONYMIZE')throw new Error('Type ANONYMIZE to confirm. Financial order snapshots are retained.');await (await getCrm()).anonymize(value(fd,'id'),actor);},'Customer contact details anonymized. Financial snapshots are retained.');}
export async function conversationAction(_:ActionResult,fd:FormData){return perform('crm',async actor=>(await getCrm()).updateConversation(value(fd,'id'),value(fd,'status') as 'open'|'pending'|'closed',value(fd,'owner'),actor,value(fd,'customerId'),value(fd,'orderId')),'Conversation saved.');}
export async function replyAction(_:ActionResult,fd:FormData){return perform('crm',async actor=>(await getCommunications()).reply(value(fd,'id'),value(fd,'body'),actor,process.env.COMMUNICATIONS_MODE==='live'?'live':'test',value(fd,'requestKey')),'Reply queued. Delivery status appears in the timeline.');}
export async function templateAction(_:ActionResult,fd:FormData){return perform('manage',async actor=>(await getCommunications()).saveTemplate({key:value(fd,'key'),channel:value(fd,'channel') as Channel,subject:value(fd,'subject'),body:value(fd,'body'),expectedVersion:Number(value(fd,'version'))},actor),'Template saved. Previously queued messages keep their original content.');}
export async function draftCampaignAction(_:ActionResult,fd:FormData){return perform('manage',async actor=>(await getCommunications()).saveCampaign({name:value(fd,'name'),subject:value(fd,'subject'),body:value(fd,'body'),mode:value(fd,'mode') as Mode},actor),'Campaign draft saved. Review it below before sending.');}
export async function sendCampaignAction(_:ActionResult,fd:FormData){return perform('manage',async actor=>{if(value(fd,'confirmation')!=='SEND')throw new Error('Type SEND to confirm the audience and content.');await (await getCommunications()).sendCampaign(value(fd,'id'),actor);},'Campaign queued for consented recipients. The worker handles delivery.');}
export async function retryNotificationAction(_:ActionResult,fd:FormData){return perform('manage',async actor=>(await getCommunications()).retryFailed(value(fd,'id'),actor),'Notification requeued.');}
export async function reconcileNotificationAction(_:ActionResult,fd:FormData){return perform('manage',async actor=>(await getCommunications()).reconcileUnknown(value(fd,'id'),value(fd,'providerId'),actor),'Provider message linked. Future delivery callbacks will update this notification.');}
export async function syncOrdersAction(_previous:ActionResult){void _previous;return perform('manage',async()=>reconcileCommerceEffects(),'Order, finance, customer, notification and analytics records synchronized. Replays do not create duplicates.');}
export async function runNotificationsAction(_previous:ActionResult){void _previous;return perform('manage',async()=>{await runCommerceMaintenance();if(process.env.COMMUNICATIONS_SEND_ENABLED!=='true')throw new Error('Commerce maintenance completed. Sending is paused in configuration.');await (await getCommunications()).processNotifications(createProviderSender());},'Worker completed. Review delivery states below.');}

export async function mergeCustomerAction(_:ActionResult,fd:FormData){return perform('manage',async actor=>{if(value(fd,'confirmation')!=='MERGE')throw new Error('Type MERGE after reviewing both customer records.');await (await getCrm()).merge(value(fd,'sourceId'),value(fd,'targetId'),value(fd,'sourceEmail'),value(fd,'targetEmail'),actor);},'Customers merged. The source record now redirects to the target; consent was not transferred.');}
