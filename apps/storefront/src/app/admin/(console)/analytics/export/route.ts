import { getAnalyticsReport } from '@/lib/analytics/report';
import { AdminAuthError } from '@/lib/admin/errors';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const params=new URL(request.url).searchParams;
  try {
    const r=await getAnalyticsReport({from:params.get('from')??undefined,to:params.get('to')??undefined,mode:params.get('mode')??undefined});
    const lines=['date_utc,mode,currency,paid_orders,gross_product_sales_minor,page_views,observed_sessions'];
    for(let at=+r.range.start;at<+r.range.end;at+=86400000){const date=new Date(at).toISOString().slice(0,10);const s=r.sales.daily.find(d=>d.date===date);const t=r.traffic.daily.find(d=>d.date===date);lines.push([date,r.mode,'CAD',s?.orders??0,s?.grossMinor??0,t?.views??0,t?.sessions??0].join(','));}
    return new Response(`${lines.join('\r\n')}\r\n`,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="crater-sales-traffic.csv"','Cache-Control':'private, no-store'}});
  } catch(error) {
    if(error instanceof AdminAuthError)return new Response('Not authorized',{status:error.code==='UNAUTHENTICATED'?401:403});
    if(error instanceof Error&&error.message.startsWith('Choose an ordered'))return new Response(error.message,{status:400});
    throw error;
  }
}
