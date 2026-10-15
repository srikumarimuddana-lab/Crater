import 'server-only';
import { getRepository } from '@/lib/commerce/repository-factory';
import { memoryStateOf } from '@/lib/commerce/memory-repository';
import { pgPoolOf } from '@/lib/commerce/postgres-repository';
import type { Store } from '@/lib/public-interactions/store';
import { createMemoryBookingStore, createBooking } from './service';
import { createPostgresBookingStore } from './repository';
import type { BookingState } from './types';
export async function getBookingStore(): Promise<Store<BookingState>> {
  const r = await getRepository();
  if (r.kind === 'postgres') return createPostgresBookingStore(pgPoolOf(r));
  const s = memoryStateOf(r);
  let store = s.ext.get('booking:store') as Store<BookingState> | undefined;
  if (!store) {
    store = createMemoryBookingStore();
    s.ext.set('booking:store', store);
  }
  return store;
}
export async function getBooking() {
  return createBooking(await getBookingStore());
}
