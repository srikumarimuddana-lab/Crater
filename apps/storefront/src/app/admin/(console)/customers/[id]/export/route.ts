import {interactionExport} from '@/components/admin/interaction-history';
import { requireCommunications } from '@/lib/communications/access';
import { getOperationsStore } from '@/lib/operations/store';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  const session=await requireCommunications();const {id}=await params;const store=await getOperationsStore();const state=await store.read();const customer=state.customers.find(c=>c.id===id);if(!customer)return new Response('Customer not found',{status:404});
  await store.mutate(s=>{s.audit.push({actor:session.staff.id,action:'customer.export',target:id,at:new Date().toISOString()});});
  return Response.json({interactions:await interactionExport(id),customer,mergedArchives:state.customers.filter(c=>c.mergedIntoId===id),conversations:state.conversations.filter(c=>c.customerId===id),notifications:state.jobs.filter(j=>j.customerId===id&&!j.templateKey.startsWith('staff_'))},{headers:{'Content-Disposition':`attachment; filename="customer-${id}.json"`,'Cache-Control':'no-store'}});
}
