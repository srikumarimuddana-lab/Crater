import { randomUUID } from 'node:crypto';
import { ActionForm, Field, Submit } from '@/components/admin/form';
import { Card, PageHeader } from '@/components/admin/ui';
import { getRepository } from '@/lib/commerce/repository-factory';
import { createInventoryRepository } from '@/lib/inventory-operations/repository';
import { shipmentAction } from '../../_actions/operations';
import { gate } from '../../_lib/gate';
export default async function Shipments(){const g=await gate('orders:fulfil');if(!g.ok)return g.view;const s=await createInventoryRepository(await getRepository()).list();return <><PageHeader title="Shipments"/><p>Ship selected quantities now, then ship the remaining items separately. Stock was committed when payment completed.</p><Card title="Create shipment"><ActionForm action={shipmentAction}><input type="hidden" name="key" value={randomUUID()}/><Field name="orderId" label="Internal order ID (from the order page URL)" inputMode="numeric" required/><Field name="lines" label="Variant ID, quantity shipped" as="textarea" hint="One line per variant; for example 1001, 2."/><Field name="carrier" label="Carrier" required/><Field name="trackingNumber" label="Tracking number" required/><Submit>Confirm shipped quantities</Submit></ActionForm></Card><Card title="Shipment history">{s.shipments.length?s.shipments.map(x=><p key={x.key}>Order {x.orderId} · {x.carrier} · {x.trackingNumber} · {x.lines.reduce((n,l)=>n+l.quantity,0)} units</p>):<p>No shipments recorded.</p>}</Card></>;}
