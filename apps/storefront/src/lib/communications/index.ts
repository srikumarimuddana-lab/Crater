import 'server-only';
import { getOperationsStore } from '@/lib/operations/store';
import { createCommunications, type EnqueueNotificationInput } from './service';
export { createCommunications } from './service';
export type { EnqueueNotificationInput } from './service';
export async function getCommunications(){return createCommunications(await getOperationsStore());}
export async function enqueueNotification(input:EnqueueNotificationInput){return (await getCommunications()).enqueueNotification(input);}
