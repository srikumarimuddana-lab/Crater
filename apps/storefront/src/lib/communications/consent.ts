import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
export function confirmationToken(customerId:string,expires:string,secret:string){return createHmac('sha256',secret).update(`subscribe:${customerId}:${expires}`).digest('base64url');}
export function verifyConfirmation(customerId:string,expires:string,token:string,secret:string,now=Date.now()){
  if(!secret||!/^\d{13}$/.test(expires)||Number(expires)<now||Number(expires)>now+48*3600000)return false;
  const a=Buffer.from(confirmationToken(customerId,expires,secret)),b=Buffer.from(token);return a.length===b.length&&timingSafeEqual(a,b);
}
