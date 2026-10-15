import { commerceModeFrom } from '@/lib/commerce/config';
import { getRepository } from '@/lib/commerce/repository-factory';
import { analyticsRepository } from '@/lib/analytics/repository';
import { CONSENT_COOKIE, SESSION_COOKIE, validateEvent } from '@/lib/analytics/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const response=(status:number,error?:string)=>new Response(error?JSON.stringify({error}):null,{status,headers:{'Cache-Control':'no-store',...(error?{'Content-Type':'application/json'}:{})}});
function cookies(request:Request):Map<string,string> {
  return new Map((request.headers.get('cookie')??'').split(';').map(x=>{const at=x.indexOf('=');return [x.slice(0,at).trim(),x.slice(at+1)];}));
}
function sameOrigin(request:Request):boolean {
  const origin=request.headers.get('origin');
  const fetchSite=request.headers.get('sec-fetch-site');
  return origin===new URL(request.url).origin && (fetchSite===null || fetchSite==='same-origin');
}
export async function POST(request:Request) {
  if(!sameOrigin(request)) return response(403,'Same-origin requests required.');
  if(cookies(request).has('crater_admin') || cookies(request).has('__Host-crater_admin')) return response(204);
  if(cookies(request).get(CONSENT_COOKIE)!=='granted' || request.headers.get('dnt')==='1') return response(204);
  if(/bot|crawler|spider|headless/i.test(request.headers.get('user-agent')??'')) return response(204);
  if(!request.headers.get('content-type')?.startsWith('application/json')) return response(415,'JSON required.');
  if(Number(request.headers.get('content-length')??0)>2048) return response(413,'Event too large.');
  let raw='';
  try {
    const reader=request.body?.getReader(); if(!reader) return response(400,'Event required.');
    const decoder=new TextDecoder(); let bytes=0;
    while(true) { const {done,value}=await reader.read(); if(done) break; bytes+=value.byteLength; if(bytes>2048) {await reader.cancel();return response(413,'Event too large.');} raw+=decoder.decode(value,{stream:true}); }
    raw+=decoder.decode();
    const parsed=validateEvent(JSON.parse(raw));
    if(!parsed.ok) return response(400,parsed.error);
    if(cookies(request).get(SESSION_COOKIE)!==parsed.event.sessionId) return response(400,'Anonymous session mismatch.');
    const result=await analyticsRepository(await getRepository()).ingest(parsed.event,commerceModeFrom(process.env));
    return result==='limited'?response(429,'Event limit reached.'):response(204);
  } catch(error) {
    if(error instanceof SyntaxError) return response(400,'Invalid JSON.');
    return response(503,'Analytics is temporarily unavailable.');
  }
}
export async function DELETE(request:Request) {
  if(!sameOrigin(request)) return response(403,'Same-origin requests required.');
  const sessionId=cookies(request).get(SESSION_COOKIE);
  try { if(sessionId) await analyticsRepository(await getRepository()).forgetSession(sessionId); return response(204); }
  catch { return response(503,'Analytics is temporarily unavailable.'); }
}
