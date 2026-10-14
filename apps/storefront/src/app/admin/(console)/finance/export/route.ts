import { requireAdmin } from '@/lib/admin';
import { getFinance, ledgerCsv } from '@/lib/finance';
export async function GET(request: Request) {
    await requireAdmin('finance:read');
    const mode = new URL(request.url).searchParams.get('mode') === 'live' ? 'live' : 'test';
    const csv = ledgerCsv(await (await getFinance()).snapshot(mode));
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="crater-ledger-${mode}.csv"`, 'Cache-Control': 'private, no-store' } });
}
