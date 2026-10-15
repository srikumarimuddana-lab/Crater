import 'server-only';
import { getRepository } from '@/lib/commerce/repository-factory';
import { memoryStateOf } from '@/lib/commerce/memory-repository';
import { pgPoolOf } from '@/lib/commerce/postgres-repository';
import {
  postgresDocumentStore,
  type Store,
} from '@/lib/public-interactions/store';
import { initialChat, createMemoryChatStore, createChat } from './service';
import type { ChatState } from './types';
export async function getChatStore(): Promise<Store<ChatState>> {
  const r = await getRepository();
  if (r.kind === 'postgres')
    return postgresDocumentStore(pgPoolOf(r), 'chat', initialChat);
  const s = memoryStateOf(r);
  let store = s.ext.get('chat:store') as Store<ChatState> | undefined;
  if (!store) {
    store = createMemoryChatStore();
    s.ext.set('chat:store', store);
  }
  return store;
}
export async function getChat() {
  return createChat(await getChatStore());
}
