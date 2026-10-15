import 'server-only';
export class SubmissionError extends Error { constructor(message:string,readonly status=400){super(message);} }
export function isJsonSubmission(request:Request){return request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()==='application/json';}
export function requireSubmissionOrigin(request:Request){
  const site=process.env.SITE_URL||process.env.NEXT_PUBLIC_SITE_URL;
  if(!site)throw new SubmissionError('Submissions are temporarily unavailable. Please try again later.',503);
  let origin:string;try{origin=new URL(site).origin;}catch{throw new SubmissionError('Submissions are temporarily unavailable. Please try again later.',503);}
  if(request.headers.get('origin')!==origin)throw new SubmissionError('Please submit this form from the Crater website.',403);
  return origin;
}
/** Parse a bounded body before decoding; native browser forms and JSON share validation. */
export async function readSubmission(request:Request,limit:number):Promise<Record<string,unknown>>{
  const type=request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if(type!=='application/json'&&type!=='application/x-www-form-urlencoded')throw new SubmissionError('Unsupported form format. Please return to the form and try again.',415);
  if(Number(request.headers.get('content-length')??0)>limit)throw new SubmissionError('Your submission is too large. Please shorten it and try again.',413);
  const reader=request.body?.getReader();let bytes=0;let body='';const decoder=new TextDecoder();
  if(reader){try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>limit){await reader.cancel();throw new SubmissionError('Your submission is too large. Please shorten it and try again.',413);}body+=decoder.decode(value,{stream:true});}body+=decoder.decode();}finally{reader.releaseLock();}}
  try{
    if(type==='application/json'){const input=JSON.parse(body);if(!input||typeof input!=='object'||Array.isArray(input))throw new Error();return input;}
    const params=new URLSearchParams(body);for(const key of params.keys())if(params.getAll(key).length!==1)throw new Error();return Object.fromEntries(params);
  }catch{throw new SubmissionError('The submitted form could not be read. Please return to the form and try again.');}
}
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function submissionResponse(request:Request,payload:{received?:boolean;message?:string;error?:string},status:number,returnPath:'/contact'|'/#newsletter'){
  const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
  if(isJsonSubmission(request))return Response.json(payload,{status,headers});
  const title=status<400?'Thank you':'Submission not completed';const text=payload.error??payload.message??'Your request has been received.';
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · Crater</title><style>body{margin:0;background:#f7f8f3;color:#242924;font:18px/1.6 system-ui,sans-serif}main{max-width:38rem;margin:12vh auto;padding:2rem}h1{line-height:1.2}a{color:#276f43;text-underline-offset:.2em}a:focus-visible{outline:3px solid #276f43;outline-offset:5px}</style></head><body><main><h1>${title}</h1><p role="${status<400?'status':'alert'}">${escape(text)}</p><a href="${returnPath}">Return to ${returnPath==='/contact'?'contact form':'the website'}</a></main></body></html>`;
  return new Response(html,{status,headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
}
