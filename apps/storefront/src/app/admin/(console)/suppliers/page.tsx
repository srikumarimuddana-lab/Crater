import { ActionForm, Field, Submit } from '@/components/admin/form';
import { Card, PageHeader } from '@/components/admin/ui';
import { getRepository } from '@/lib/commerce/repository-factory';
import { createInventoryRepository } from '@/lib/inventory-operations/repository';
import { supplierAction } from '../../_actions/operations';
import { gate } from '../../_lib/gate';
export default async function Suppliers(){const g=await gate('products:write');if(!g.ok)return g.view;const s=await createInventoryRepository(await getRepository()).list();return <><PageHeader title="Suppliers"/><div className="a-grid2"><Card title="Supplier directory">{s.suppliers.length?s.suppliers.map(x=><p key={x.id}><strong>{x.name}</strong><br/>{x.email||'No email recorded'}</p>):<p>No suppliers yet.</p>}</Card><Card title="Add supplier"><ActionForm action={supplierAction}><Field name="name" label="Name" required/><Field name="email" label="Email" type="email"/><Submit>Add supplier</Submit></ActionForm></Card></div></>;}
