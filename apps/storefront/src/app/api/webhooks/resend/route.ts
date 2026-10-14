import { verifyResendWebhook } from '@/lib/communications/providers';
import { getCommunications } from '@/lib/communications';
import { getCrm } from '@/lib/crm';
export const runtime='nodejs';
export async function POST(request:Request){
  if(Number(request.headers.get('content-length')??0)>262144)return new Response('Payload too large',{status:413});
  const body=await request.text();if(body.length>262144)return new Response('Payload too large',{status:413});
  if(!verifyResendWebhook(body,request.headers,process.env.RESEND_WEBHOOK_SECRET??''))return new Response('Invalid signature',{status:401});
  let event:{type:string;data:Record<string,unknown>};try{event=JSON.parse(body);if(!event.data||typeof event.type!=='string')throw new Error();}catch{return new Response('Invalid event',{status:400});}
  const eventId=`resend:${request.headers.get('svix-id')}`;
  try{
    const id=event.data.email_id;if(typeof id!=='string')return new Response('Invalid email ID',{status:400});
    if(event.type==='email.received'){
      // Received webhooks contain metadata, not message content. Fetch only the signed ID at a fixed provider endpoint.
      if(!process.env.RESEND_API_KEY)return new Response('Receiving is not configured',{status:503});
      const response=await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`},signal:AbortSignal.timeout(10000)});
      if(!response.ok)return new Response('Receiving lookup failed',{status:503});
      const received=await response.json() as {from?:string;text?:string;subject?:string;html?:string};
      const from=received.from?.match(/<([^>]+)>/)?.[1]??received.from;
      if(!from)return new Response('Missing sender',{status:400});
      await (await getCrm()).inbound({eventId,channel:'email',recipient:from,subject:received.subject??'Email reply',body:received.text?.trim()||'Email received without a plain-text body. Review the original message in Resend.'});
    }else{
      const status=event.type==='email.delivered'?'delivered':event.type==='email.bounced'||event.type==='email.failed'?'failed':event.type==='email.complained'?'suppressed':event.type==='email.sent'?'accepted':null;
      if(status)await (await getCommunications()).deliveryEvent({eventId,providerId:id,status,...(event.type==='email.bounced'?{suppression:'bounce' as const}:event.type==='email.complained'?{suppression:'complaint' as const}:{})});
    }return Response.json({received:true});
  }catch{return new Response('Event could not be persisted; retry required',{status:503});}
}
