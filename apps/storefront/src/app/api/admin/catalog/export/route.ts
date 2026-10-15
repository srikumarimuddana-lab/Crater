import { requireAdmin } from '@/lib/admin';
import { getRepository } from '@/lib/commerce/repository-factory';
import { exportCatalogCsv } from '@/lib/inventory-operations/catalog';
export async function GET(){await requireAdmin('products:write');const csv=exportCatalogCsv(await(await getRepository()).listProducts({includeInactive:true}));return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="catalog.csv"','Cache-Control':'private, no-store'}});}
