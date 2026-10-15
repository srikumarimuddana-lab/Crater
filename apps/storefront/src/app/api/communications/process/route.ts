import { createHash, timingSafeEqual } from 'node:crypto';
import { getCommunications } from '@/lib/communications';
import { createProviderSender } from '@/lib/communications/providers';
import { runCommerceMaintenance } from '@/lib/operations/commerce';
export const runtime='nodejs';
/** One-shot endpoint for an external scheduler; no detached tasks or process-local timers. */
export async function POST(request:Request){
  const secret=process.env.COMMUNICATIONS_WORKER_SECRET;const bearer=request.headers.get('authorization')??'';
  if(!secret||!timingSafeEqual(createHash('sha256').update(bearer).digest(),createHash('sha256').update(`Bearer ${secret}`).digest()))return new Response('Unauthorized',{status:401});
  const reconciled=await runCommerceMaintenance();
  if(process.env.COMMUNICATIONS_SEND_ENABLED!=='true')return Response.json({...reconciled,processed:0,paused:true});
  return Response.json({...reconciled,...await (await getCommunications()).processNotifications(createProviderSender())});
}
