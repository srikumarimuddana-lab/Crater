import 'server-only';
import { getOperationsStore } from '@/lib/operations/store';
import { createCrm, type RecordCustomerOrderInput } from './service';
export { createCrm } from './service';
export type { RecordCustomerOrderInput } from './service';
export async function getCrm(){return createCrm(await getOperationsStore());}
export async function recordCustomerOrder(input:RecordCustomerOrderInput){return (await getCrm()).recordCustomerOrder(input);}
