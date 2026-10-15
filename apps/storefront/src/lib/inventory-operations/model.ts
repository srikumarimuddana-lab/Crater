export class InventoryError extends Error {
}
export type Units = {
    variantId: string;
    quantity: number;
};
export type PurchaseLine = Units & {
    unitCostMinor: number;
};
export type Supplier = {
    id: string;
    name: string;
    email: string;
};
export type PurchaseOrder = {
    id: string;
    supplierId: string;
    reference: string;
    lines: PurchaseLine[];
};
export type Receipt = {
    mode: 'test' | 'live';
    key: string;
    purchaseOrderId: string;
    lines: Units[];
};
export type Shipment = {
    key: string;
    orderId: number;
    lines: Units[];
    carrier: string;
    trackingNumber: string;
};
export type PhysicalReturn = {
    key: string;
    orderId: number;
    lines: Units[];
    restock: boolean;
    reason: string;
};
export type ShippingRule = {
    id: string;
    version: number;
    kind: 'shipping';
    name: string;
    provinces: string[];
    amountMinor: number;
    freeAboveMinor: number | null;
    active: boolean;
};
export type DiscountRule = {
    id: string;
    version: number;
    kind: 'discount';
    code: string;
    percent: number;
    minimumMinor: number;
    startsAt: string | null;
    endsAt: string | null;
    active: boolean;
};
export type PricingRule = ShippingRule | DiscountRule;
export function textValue(value: unknown, label: string, max = 200, optional = false): string {
    if (typeof value !== 'string' || (!optional && !value.trim()) || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value))
        throw new InventoryError(`${label} is invalid.`);
    return value.trim();
}
export function whole(value: unknown, label: string, min = 1, max = 100000): number {
    if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max)
        throw new InventoryError(`${label} must be a whole number from ${min} to ${max}.`);
    return Number(value);
}
export function units(lines: Units[]): Units[] {
    if (!Array.isArray(lines) || !lines.length || lines.length > 100)
        throw new InventoryError('Choose 1–100 stock lines.');
    const seen = new Set<string>();
    return lines.map(l => {
        if (!/^gid:\/\/crater\/ProductVariant\/[1-9]\d*$/.test(l.variantId) || seen.has(l.variantId))
            throw new InventoryError('Unknown or duplicate variant.');
        seen.add(l.variantId);
        return { variantId: l.variantId, quantity: whole(l.quantity, 'Quantity') };
    }).sort((a, b) => Number(a.variantId.split('/').at(-1)) - Number(b.variantId.split('/').at(-1)));
}
export function requestKey(key: string) { if (!/^[A-Za-z0-9_-]{8,100}$/.test(key))
    throw new InventoryError('A stable request key is required.'); return key; }
export function sameRequest(existing: unknown, next: unknown) {
    const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
        : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => [key,canonical(item)])) : value;
    if (JSON.stringify(canonical(existing)) !== JSON.stringify(canonical(next))) throw new InventoryError('This request key was already used for different data.');
}
export function assertRemaining(requested: Units[], ordered: Units[], previous: Units[]) {
    for (const l of requested) {
        const max = ordered.filter(x => x.variantId === l.variantId).reduce((n, x) => n + x.quantity, 0);
        const used = previous.filter(x => x.variantId === l.variantId).reduce((n, x) => n + x.quantity, 0);
        if (l.quantity > max - used)
            throw new InventoryError('Quantity exceeds the remaining quantity.');
    }
}
export function validateRule(rule: PricingRule): PricingRule {
    textValue(rule.id, 'Rule ID', 80);
    whole(rule.version, 'Version', 0);
    if (typeof rule.active !== 'boolean')
        throw new InventoryError('Choose whether the rule is active.');
    if (rule.kind === 'shipping') {
        textValue(rule.name, 'Shipping name', 80);
        whole(rule.amountMinor, 'Shipping amount', 0, 10000000);
        if (rule.freeAboveMinor !== null)
            whole(rule.freeAboveMinor, 'Free shipping threshold', 0, 10000000);
        if (!Array.isArray(rule.provinces) || rule.provinces.some(p => !['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'].includes(p)))
            throw new InventoryError('Choose valid Canadian provinces.');
    }
    else if (rule.kind === 'discount') {
        if (!/^[A-Z0-9_-]{3,40}$/.test(rule.code))
            throw new InventoryError('Discount codes use 3–40 uppercase letters, numbers, underscores or hyphens.');
        whole(rule.percent, 'Discount percent', 1, 100);
        whole(rule.minimumMinor, 'Minimum subtotal', 0, 10000000);
        for (const d of [rule.startsAt, rule.endsAt])
            if (d !== null && !Number.isFinite(Date.parse(d)))
                throw new InventoryError('Invalid discount date.');
        if (rule.startsAt && rule.endsAt && Date.parse(rule.startsAt) >= Date.parse(rule.endsAt))
            throw new InventoryError('End must follow start.');
    }
    else
        throw new InventoryError('Unknown pricing rule.');
    return rule;
}
/** Server-side quote. Taxes must be recomputed on discounted merchandise and shipping. */
export function calculatePricing(rules: PricingRule[], subtotalMinor: number, province: string, code?: string, now = new Date()) {
    whole(subtotalMinor, 'Subtotal', 0, 100000000);
    const discounts = rules.filter((r): r is DiscountRule => r.kind === 'discount' && r.active && r.code === code?.trim().toUpperCase());
    const d = discounts.find(r => subtotalMinor >= r.minimumMinor && (!r.startsAt || now.getTime() >= Date.parse(r.startsAt)) && (!r.endsAt || now.getTime() < Date.parse(r.endsAt)));
    if (code && !d)
        throw new InventoryError('Discount is unavailable or its minimum has not been met.');
    const discountMinor = d ? Math.floor(subtotalMinor * d.percent / 100) : 0;
    const shipping = rules.filter((r): r is ShippingRule => r.kind === 'shipping' && r.active && (!r.provinces.length || r.provinces.includes(province)))
        .map(r => ({ id: r.id, name: r.name, amountMinor: r.freeAboveMinor !== null && subtotalMinor - discountMinor >= r.freeAboveMinor ? 0 : r.amountMinor })).sort((a, b) => a.amountMinor - b.amountMinor || a.id.localeCompare(b.id));
    return { discountMinor, discountCode: d?.code ?? null, merchandiseMinor: subtotalMinor - discountMinor, shipping: shipping[0] ?? null };
}

export type CostUnits = Units & { unitCostMinor: number | null };
/** FIFO allocation from immutable shipment costs; earlier non-restocked returns also consume their lot. */
export function returnCostSnapshot(requested: Units[], shipped: CostUnits[], returned: Units[]): CostUnits[] {
    const result: CostUnits[] = [];
    for (const line of requested) {
        let skip = returned.filter(l => l.variantId === line.variantId).reduce((n,l) => n+l.quantity,0);
        let remaining = line.quantity;
        for (const lot of shipped.filter(l => l.variantId === line.variantId)) {
            const skipped = Math.min(skip, lot.quantity);
            skip -= skipped;
            const take = Math.min(remaining, lot.quantity-skipped);
            if (take > 0) result.push({variantId:line.variantId,quantity:take,unitCostMinor:lot.unitCostMinor});
            remaining -= take;
            if (!remaining) break;
        }
        if (remaining) result.push({variantId:line.variantId,quantity:remaining,unitCostMinor:null});
    }
    return result;
}
