import { verifyTwilioWebhook } from '@/lib/communications/providers';
import { getCommunications } from '@/lib/communications';
import { getCrm } from '@/lib/crm';
export const runtime='nodejs';
export async function POST(request:Request){
  if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return new Response('Unsupported content type',{status:415});
  const body=await request.text();if(body.length>65536)return new Response('Payload too large',{status:413});
  const params=new URLSearchParams(body);const inbound=params.has('Body');
  const configured=inbound?process.env.TWILIO_INBOUND_WEBHOOK_URL:process.env.TWILIO_STATUS_CALLBACK_URL;
  if(!configured||!verifyTwilioWebhook(configured,params,request.headers.get('x-twilio-signature')??'',process.env.TWILIO_AUTH_TOKEN??''))return new Response('Invalid signature',{status:401});
  if(params.get('AccountSid')!==process.env.TWILIO_ACCOUNT_SID)return new Response('Wrong account',{status:401});
  const id=params.get('MessageSid');if(!id)return new Response('Missing message ID',{status:400});
  try{
    if(inbound)await (await getCrm()).inbound({eventId:`twilio:${id}`,channel:'sms',recipient:params.get('From')??'',subject:'Incoming SMS',body:params.get('Body')??''});
    else {
      const raw=params.get('MessageStatus');const status=raw==='delivered'||raw==='read'?'delivered':raw==='failed'||raw==='undelivered'?'failed':['accepted','queued','sending','sent'].includes(raw??'')?'accepted':null;
      if(status)await (await getCommunications()).deliveryEvent({eventId:`twilio:${id}:${raw}`,providerId:id,status});
    }
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>',{headers:{'Content-Type':'text/xml'}});
  }catch{return new Response('Event could not be persisted; retry required',{status:503});}
}
