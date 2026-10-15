import { randomUUID } from 'node:crypto';
import { authFailureView } from '@/app/admin/_lib/gate';
import { requireCommunications, type CommunicationsAccess } from './access';
export async function communicationsGate(access:CommunicationsAccess='crm'){
  try{return {ok:true as const,session:await requireCommunications(access)};}catch(e){return {ok:false as const,view:authFailureView(e)};}
}
export function Field({name,label,value='',type='text',required=false}:{name:string;label:string;value?:string;type?:string;required?:boolean}){const id=randomUUID();return <div className="a-field"><label htmlFor={id}>{label}</label><input id={id} name={name} type={type} defaultValue={value} required={required}/></div>;}
export function TextArea({name,label,value='',maxLength=20000}:{name:string;label:string;value?:string;maxLength?:number}){const id=randomUUID();return <div className="a-field"><label htmlFor={id}>{label}</label><textarea id={id} name={name} defaultValue={value} rows={5} maxLength={maxLength} required/></div>;}
export function Hidden({name,value}:{name:string;value:string|number}){return <input type="hidden" name={name} value={value}/>;}
export function Money({minor,currency='CAD'}:{minor:number;currency?:string}){return <>{new Intl.NumberFormat('en-CA',{style:'currency',currency}).format(minor/100)}</>;}
export function MaskedRecipient({recipient}:{recipient:string}){return <>{recipient.includes('@')?recipient.replace(/^(.).*(@.*)$/,'$1***$2'):`***${recipient.slice(-4)}`}</>;}
