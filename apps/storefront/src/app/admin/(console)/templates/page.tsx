import { PageHeader,Card } from '@/components/admin/ui';
import { communicationsGate,Hidden,Field,TextArea } from '@/lib/communications/admin-ui';
import { getOperationsStore } from '@/lib/operations/store';
import { ActionForm } from '@/lib/communications/form';
import { interpolate } from '@/lib/communications/service';
import { templateAction } from '@/app/admin/_actions/communications';
export default async function TemplatesPage(){
  const g=await communicationsGate('manage');if(!g.ok)return g.view;const state=await (await getOperationsStore()).read();const sample={name:'Sample customer',order:'#1001',total:'CAD 24.00',tracking:'SAMPLE-TRACKING',carrier:'Sample carrier',amount:'CAD 12.00',message:'Thank you for contacting us.',link:'https://example.com/sample-link',unsubscribe:'https://example.com/unsubscribe'};
  return <><PageHeader title="Message templates"/><p>Allowed variables: name, order, total, amount, carrier, tracking, message, link, unsubscribe. Use double braces, for example {'{{order}}'}. Templates produce escaped HTML and plain text. Existing queued messages keep their saved version.</p>{state.templates.map(t=><Card key={`${t.key}:${t.channel}`} title={`${t.key.replaceAll('_',' ')} · ${t.channel}`}><p>Version {t.version}</p><ActionForm action={templateAction} label="Save template"><Hidden name="key" value={t.key}/><Hidden name="channel" value={t.channel}/><Hidden name="version" value={t.version}/><Field name="subject" label="Subject" value={t.subject} required/><TextArea name="body" label="Body" value={t.body} maxLength={t.channel==='sms'?1500:20000}/></ActionForm><details><summary>Preview with sample data</summary><h3>{interpolate(t.subject,sample)}</h3><p style={{whiteSpace:'pre-wrap'}}>{interpolate(t.body,sample)}</p></details></Card>)}</>;
}
