import { HANDLE, privateJson, publicJson } from '@/lib/commerce/http';
import { getStorefront } from '@/lib/commerce';

export async function GET(_request: Request, ctx: { params: Promise<{ handle: string }> }) {
  const { handle } = await ctx.params;
  const product = HANDLE.test(handle) && handle.length <= 100 ? await getStorefront().product({ handle }) : null;
  if (!product) return privateJson({ error: 'Not found' }, 404);
  return publicJson(product);
}
