import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/** False during server render and hydration, true afterwards. Used to add controls that need JavaScript. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
