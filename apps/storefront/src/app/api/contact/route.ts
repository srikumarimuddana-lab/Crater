import { createHash, randomUUID } from 'node:crypto';
import { getCrm } from '@/lib/crm';
import { getOperationsStore } from '@/lib/operations/store';
import { normalizeEmail, clean } from '@/lib/crm/service';
import { readSubmission,requireSubmissionOrigin,submissionResponse,SubmissionError } from '@/lib/communications/public-forms';
export const runtime='nodejs';
export async function POST(request:Request){
  try{
    requireSubmissionOrigin(request);const input=await readSubmission(request,15000);
    if(input.website)throw new SubmissionError('We could not accept this submission. Please leave the website field empty.');
    let email:string,subject:string,message:string;
    try{email=normalizeEmail(input.email as string);subject=clean(input.subject as string,200);message=clean(input.message as string,10000);}catch{throw new SubmissionError('Enter a valid email, subject and message.');}
    const store=await getOperationsStore();const key=createHash('sha256').update(`contact:${email}`).digest('hex');
    const allowed=await store.mutate(s=>{const now=Date.now();for(const k of Object.keys(s.rateLimits))if(now-s.rateLimits[k].start>3600000)delete s.rateLimits[k];const limit=s.rateLimits[key]??={start:now,count:0};limit.count++;return limit.count<=5;});
    if(!allowed)throw new SubmissionError('Please wait before submitting another message.',429);
    const eventId=typeof input.requestId==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId)?input.requestId:randomUUID();
    await (await getCrm()).inbound({eventId:`contact:${key}:${eventId}`,channel:'email',recipient:email,subject,body:message});
    return submissionResponse(request,{received:true,message:'Your message is with our team. We will reply by email.'},200,'/contact');
  }catch(error){return submissionResponse(request,{error:error instanceof SubmissionError?error.message:'We could not save your message. Please return to the form and try again shortly.'},error instanceof SubmissionError?error.status:503,'/contact');}
}
