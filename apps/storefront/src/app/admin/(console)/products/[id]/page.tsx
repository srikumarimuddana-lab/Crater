import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fieldAccess, getAdmin } from '@/lib/admin';
import { CHECK_HELP, CHECK_LABEL, gidFrom, plural } from '@/components/admin/format';
import { ActionForm, Field, Submit } from '@/components/admin/form';
import { Icon } from '@/components/admin/icons';
import { ProductStatusBadge } from '@/components/admin/status';
import { Card, Notice, PageHeader, StatusBadge } from '@/components/admin/ui';
import { saveProductAction, setStatusAction } from '../../../_actions/products';
import { gate } from '../../../_lib/gate';

export const metadata: Metadata = { title: 'Edit product' };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: slug } = await params;
  const g = await gate('products:read');
  if (!g.ok) return g.view;
  const gid = gidFrom('Product', slug);
  const p = gid ? await (await getAdmin()).products.get(gid) : null;
  if (!p) notFound();

  const canWrite = g.can('products:write');
  const canPublish = g.can('products:publish');
  const showCost = fieldAccess(g.session.staff.role).productCost;
  const failing = p.publishChecks.filter((c) => !c.passed);

  return (
    <>
      <PageHeader
        title={p.title}
        breadcrumb={[{ label: 'Products', href: '/admin/products' }, { label: p.title }]}
        badges={
          <>
            <ProductStatusBadge status={p.status} />
            {p.sample ? <StatusBadge shape="info" label="Sample product" /> : null}
          </>
        }
      />
      <div className="a-grid2">
        <ActionForm action={saveProductAction} label="Edit product" className="a-stack">
          <input type="hidden" name="productId" value={slug} />
          <input type="hidden" name="expectedUpdatedAt" value={p.updatedAt} />
          <input type="hidden" name="variantCount" value={p.variants.length} />
          {!canWrite ? <Notice tone="info">You can view this product but not change it.</Notice> : null}
          <fieldset disabled={!canWrite} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} className="a-stack">
            <Card title="Title and description" id="basics">
              <Field name="title" label="Title" defaultValue={p.title} required maxLength={120} />
              <Field name="description" label="Description" as="textarea" rows={5} defaultValue={p.description} />
            </Card>
            <Card title="Details" id="details">
              <Field name="details.ingredients" label="Ingredients" as="textarea" rows={4} defaultValue={p.details.ingredients.join('\n')} hint="One per line." />
              <Field name="details.howToUse" label="Directions for use" as="textarea" rows={3} defaultValue={p.details.howToUse} />
              <Field name="details.precautions" label="Precautions" as="textarea" rows={3} defaultValue={p.details.precautions} />
              <Field name="details.benefits" label="What it is" as="textarea" rows={3} defaultValue={p.details.benefits.join('\n')} hint="Shown on the product page under “What it is”. One per line; no health claims until licensed." />
            </Card>
            <Card title="Variants" id="variants">
              <div className="a-stack">
                {p.variants.map((v, i) => (
                  <fieldset key={v.id} style={{ border: '1px solid var(--a-line)', borderRadius: 4, padding: 12, margin: 0, minWidth: 0 }}>
                    <legend style={{ fontWeight: 600, padding: '0 4px' }}>
                      {v.title} <span className="a-muted" style={{ fontWeight: 400 }}>(SKU {v.sku})</span>
                    </legend>
                    <input type="hidden" name={`variants.${i}.id`} value={v.id} />
                    <input type="hidden" name={`variants.${i}.hadCost`} value={v.cost ? '1' : '0'} />
                    <Field
                      name={`variants.${i}.price`}
                      label={`Price, ${v.price.currencyCode}`}
                      inputMode="decimal"
                      defaultValue={v.price.amount}
                      required
                      autoComplete="off"
                      hint={v.openCartCount > 0 ? `${plural(v.openCartCount, 'open bag')} hold this variant. Shoppers will see a price-change notice.` : 'No open bags hold this variant.'}
                    />
                    {showCost ? <Field name={`variants.${i}.cost`} label={`Cost, ${v.price.currencyCode}`} inputMode="decimal" defaultValue={v.cost?.amount ?? ''} autoComplete="off" hint="Optional. Visible to owners, admins and bookkeepers." /> : null}
                    <Field name={`variants.${i}.lowStockThreshold`} label="Low-stock threshold" inputMode="numeric" defaultValue={String(v.lowStockThreshold)} required autoComplete="off" />
                    <p className="a-muted">
                      Available {v.available} · Committed {v.committed} · On hand {v.onHand}. Change stock on the Inventory page.
                    </p>
                  </fieldset>
                ))}
              </div>
            </Card>
          </fieldset>
          {canWrite ? (
            <div>
              <Submit pendingText="Saving…">Save changes</Submit>
            </div>
          ) : null}
        </ActionForm>

        <div className="a-stack">
          <Card title="Publish checklist" id="checklist">
            <ul className="a-checklist">
              {p.publishChecks.map((c) => (
                <li key={c.key} className={c.passed ? 'is-pass' : 'is-fail'}>
                  <Icon shape={c.passed ? 'check-circle' : 'triangle'} size={16} />
                  <div>
                    <strong>{CHECK_LABEL[c.key] ?? c.key}</strong> <span className="a-sr">{c.passed ? 'passed' : 'not met'}</span>
                    {!c.passed ? <p className="a-muted">{CHECK_HELP[c.key]}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
            {failing.some((c) => c.key === 'NOT_SAMPLE') ? (
              <p className="a-muted" style={{ marginTop: 12 }}>
                This is a marked sample product, so it cannot be published, even in test mode. Publishing needs real product content.
              </p>
            ) : null}
          </Card>
          {canPublish ? (
            <Card title="Status" id="status">
              <ActionForm action={setStatusAction} label="Product status">
                <input type="hidden" name="productId" value={slug} />
                <input type="hidden" name="expectedUpdatedAt" value={p.updatedAt} />
                <Field
                  name="status"
                  label="Status"
                  as="select"
                  defaultValue={p.status}
                  options={[
                    { value: 'DRAFT', label: 'Draft' },
                    { value: 'ACTIVE', label: 'Active' },
                    { value: 'ARCHIVED', label: 'Archived' },
                  ]}
                  hint="Only Active products appear in the shop. Active needs every check above."
                />
                <Submit primary={false} pendingText="Updating…">
                  Update status
                </Submit>
              </ActionForm>
            </Card>
          ) : null}
          <Card title="Images" id="images">
            {p.images.length === 0 ? (
              <p className="a-muted">No images.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {p.images.map((im) => (
                  <li key={im.url}>{im.altText ? <>Alt text: {im.altText}</> : <strong>Alt text missing</strong>}</li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
