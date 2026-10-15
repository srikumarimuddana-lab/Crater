import { createHash } from 'node:crypto';
import { normalizeEmail,upsertCustomer } from '@/lib/crm/service';
import { getOperationsStore } from '@/lib/operations/store';
import { getCommunications } from '@/lib/communications';
import { confirmationToken } from '@/lib/communications/consent';
import { integrationHealth } from '@/lib/communications/providers';
import { isJsonSubmission,readSubmission,requireSubmissionOrigin,submissionResponse,SubmissionError } from '@/lib/communications/public-forms';
export const runtime='nodejs';
export async function POST(request:Request){
  try{
    const origin=requireSubmissionOrigin(request);const input=await readSubmission(request,2000);
    let email:string;try{if(input.channel!=='email'||input.consent!==(isJsonSubmission(request)?true:'true'))throw new Error();email=normalizeEmail(input.email as string);}catch{throw new SubmissionError('Provide your email address and email consent.');}
    const secret=process.env.COMMUNICATIONS_UNSUBSCRIBE_SECRET;const mode=process.env.COMMUNICATIONS_MODE==='live'?'live':'test';
    const provider=integrationHealth().find(p=>p.channel==='email')!;
    const allowed=(process.env.COMMUNICATIONS_TEST_RECIPIENTS??'').split(',').map(value=>value.trim().toLowerCase());
    if(!secret||!provider.configured||!provider.sendingEnabled||(mode==='live'&&!provider.liveEnabled)||(mode==='test'&&!allowed.includes(email)))throw new SubmissionError('Email subscriptions are not available yet. Please return to the website and try again later.',503);
    const store=await getOperationsStore();const now=Date.now();const digest=createHash('sha256').update(email).digest('hex');
    const customer=await store.mutate(s=>{const key=`subscription:${digest}`;const old=s.rateLimits[key];if(!old||now-old.start>3600000)s.rateLimits[key]={start:now,count:0};if(++s.rateLimits[key].count>3)return null;return upsertCustomer(s,email,new Date(now).toISOString());});
    if(!customer)throw new SubmissionError('Please wait before requesting another confirmation.',429);
    const expires=String(now+24*3600000);const token=confirmationToken(customer.id,expires,secret);
    const link=`${origin}/api/consent/confirm?customer=${encodeURIComponent(customer.id)}&expires=${expires}&token=${token}`;
    const job=await (await getCommunications()).enqueueNotification({eventKey:`subscription:${customer.id}:${Math.floor(now/3600000)}`,channel:'email',recipient:email,templateKey:'marketing_confirmation',variables:{link},mode,customerId:customer.id});
    if(['suppressed','failed','unknown'].includes(job.status))throw new SubmissionError('We could not schedule your confirmation email. Please contact our team for help.',503);
    return submissionResponse(request,{received:true,message:'Your confirmation email is queued. Check your email to confirm your subscription.'},200,'/#newsletter');
  }catch(error){return submissionResponse(request,{error:error instanceof SubmissionError?error.message:'We could not save your subscription request. Please return to the website and try again later.'},error instanceof SubmissionError?error.status:503,'/#newsletter');}
}
