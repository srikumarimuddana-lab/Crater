'use client';
import { useActionState, type ReactNode } from 'react';
export type ActionResult={error?:string;message?:string};
export function ActionForm({action,children,label='Save',className='a-form'}:{action:(previous:ActionResult,form:FormData)=>Promise<ActionResult>;children:ReactNode;label?:string;className?:string}){
  const [state,submit,pending]=useActionState(action,{});
  return <form action={submit} className={className}>{children}{state.error?<p className="a-notice is-critical" role="alert">{state.error}</p>:null}{state.message?<p className="a-notice is-success" role="status">{state.message}</p>:null}<button className="a-btn" disabled={pending}>{pending?'Saving…':label}</button></form>;
}
