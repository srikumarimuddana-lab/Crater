import { randomUUID } from 'node:crypto';
import { ActionForm, Field, Submit } from '@/components/admin/form';
import { Card, PageHeader } from '@/components/admin/ui';
import { getRepository } from '@/lib/commerce/repository-factory';
import { createInventoryRepository } from '@/lib/inventory-operations/repository';
import { returnAction } from '../../_actions/operations';
import { gate } from '../../_lib/gate';
export default async function Returns(){const g=await gate('products:write');if(!g.ok)return g.view;const s=await createInventoryRepository(await getRepository()).list();return <><PageHeader title="Physical returns"/><p>Record goods only after receiving them. Refunds are processed separately in Payments.</p><Card title="Receive return"><ActionForm action={returnAction}><input type="hidden" name="key" value={randomUUID()}/><Field name="orderId" label="Internal order ID" inputMode="numeric"/><Field name="lines" label="Variant ID, quantity returned" as="textarea"/><Field name="reason" label="Reason and condition"/><Field name="restock" label="Stock disposition" as="select" options={[{value:'no',label:'Do not restock (damaged / unsellable)'},{value:'yes',label:'Restock inspected, sellable goods'}]}/><Submit>Confirm physical return</Submit></ActionForm></Card><Card title="Received returns">{s.returns.length?s.returns.map(x=><p key={x.key}>Order {x.orderId} · {x.lines.reduce((n,l)=>n+l.quantity,0)} units · {x.restock?'Restocked':'Not restocked'} · {x.reason}</p>):<p>No physical returns yet.</p>}</Card></>;}
