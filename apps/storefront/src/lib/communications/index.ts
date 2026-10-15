import 'server-only';
import {bookingSendGuard} from '@/lib/booking/notifications';
import {getBookingStore} from '@/lib/booking';
import { getOperationsStore } from '@/lib/operations/store';
import { createCommunications, type EnqueueNotificationInput } from './service';
export { createCommunications } from './service';
export type { EnqueueNotificationInput } from './service';
export async function getCommunications(){return createCommunications(await getOperationsStore(),()=>new Date(),{beforeSend:async job=>job.source?bookingSendGuard(await getBookingStore(),job):{send:true}});}
export async function enqueueNotification(input:EnqueueNotificationInput){return (await getCommunications()).enqueueNotification(input);}
