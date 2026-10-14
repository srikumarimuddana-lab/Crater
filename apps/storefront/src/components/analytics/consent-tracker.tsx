'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { analyticsPath, CLICK_IDS, CONSENT_COOKIE, SESSION_COOKIE, UUID, coarseSource, type ClientEventName, type ClickId, type Device } from '@/lib/analytics/schema';

function cookie(name: string): string | null {
  return document.cookie.split('; ').find(x=>x.startsWith(`${name}=`))?.slice(name.length+1) ?? null;
}
function writeCookie(name: string, value: string, age: number) {
  document.cookie=`${name}=${value}; Path=/; Max-Age=${age}; SameSite=Lax${location.protocol==='https:'?'; Secure':''}`;
}
function session(): string {
  const existing=cookie(SESSION_COOKIE);
  const id=existing && UUID.test(existing)?existing:crypto.randomUUID();
  writeCookie(SESSION_COOKIE,id,1800); return id;
}
/** Call only after a successful cart operation; click intent is recorded separately. */
export function trackCommerceEvent(name: 'add_to_cart') {
  window.dispatchEvent(new CustomEvent('crater:analytics',{detail:{name}}));
}
function subscribeConsent(onChange:()=>void) {
  window.addEventListener('crater:consent',onChange);window.addEventListener('focus',onChange);
  return ()=>{window.removeEventListener('crater:consent',onChange);window.removeEventListener('focus',onChange);};
}
export function AnalyticsConsentTracker() {
  const path=usePathname();
  const choice=useSyncExternalStore(subscribeConsent,()=>cookie(CONSENT_COOKIE),()=>'loading');
  const [editing,setEditing]=useState(false);
  const lastView=useRef<string | null>(null);
  useEffect(()=>{
    if (choice!=='granted' || !path || !analyticsPath(path) || navigator.doNotTrack==='1') return;
    const safePath=analyticsPath(path)!;
    const device:Device=window.innerWidth<768?'mobile':window.innerWidth<1024?'tablet':'desktop';
    const source=coarseSource(document.referrer,location.origin);
    const send=(name:ClientEventName,clickId:ClickId | null=null)=>{
      if(cookie(CONSENT_COOKIE)!=='granted') return;
      const payload={id:crypto.randomUUID(),sessionId:session(),consent:true,name,path:safePath,device,source,clickId};
      void fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true}).catch(()=>{});
    };
    // React Strict Mode remounts effects: do not inflate the same navigation.
    if(lastView.current!==path) {
      lastView.current=path; send('page_view');
      if(safePath==='/products/[product]') send('product_view');
      if(safePath.startsWith('/collections')) send('collection_view');
    }
    const click=(event:MouseEvent)=>{
      const target=event.target instanceof Element?event.target.closest('[data-track]'):null;
      const id=target?.getAttribute('data-track');
      if(id && CLICK_IDS.includes(id as ClickId)) send('cta_click',id as ClickId);
    };
    const commerce=(event:Event)=>{
      const name=(event as CustomEvent<{name?:string}>).detail?.name;
      if(name==='add_to_cart') send(name);
    };
    document.addEventListener('click',click);
    window.addEventListener('crater:analytics',commerce);
    return ()=>{ document.removeEventListener('click',click); window.removeEventListener('crater:analytics',commerce); };
  },[choice,path]);
  if (!path || path.startsWith('/admin') || choice==='loading') return null;
  const choose=(next:'granted'|'denied')=>{
    if(next==='denied') {
      // This request removes pending checkout attribution; it collects no event.
      void fetch('/api/analytics',{method:'DELETE',keepalive:true}).catch(()=>{});
      writeCookie(SESSION_COOKIE,'',0); lastView.current=null;
    }
    writeCookie(CONSENT_COOKIE,next,180*86400);window.dispatchEvent(new Event('crater:consent'));setEditing(false);
  };
  return choice && !editing ? <button type="button" className="analytics-preferences" onClick={()=>setEditing(true)}>Analytics preferences</button> : (
    <aside className="analytics-consent" aria-label="Analytics preferences">
      <div><strong>Your analytics choice</strong><p>Allow anonymous page and button counts to help improve the shop. We never collect form entries. Shopping works with either choice.</p>{navigator.doNotTrack==='1'?<p>Your browser’s Do Not Track preference prevents collection.</p>:null}</div>
      <div className="analytics-consent-actions"><button type="button" onClick={()=>choose('denied')}>Reject analytics</button><button type="button" onClick={()=>choose('granted')}>Allow analytics</button></div>
    </aside>
  );
}
