import { InvalidCursorError } from '@/lib/commerce/catalog';
import { BadRequest, badRequest, parseProductsQuery, publicJson } from '@/lib/commerce/http';
import { getStorefront } from '@/lib/commerce';

export async function GET(request: Request) {
  try {
    const args = parseProductsQuery(new URL(request.url).searchParams);
    return publicJson(await getStorefront().products(args));
  } catch (error) {
    if (error instanceof BadRequest || error instanceof InvalidCursorError) return badRequest(error.message);
    throw error;
  }
}
