/**
 * A Map-backed IndexedDB for tests of the guest draft (jsdom has none): open, put, get, delete, getAllKeys, clear.
 * `failWrites` makes every write fail, like a browser that refuses storage.
 */
export interface FakeIndexedDb {
  readonly factory: IDBFactory;
  readonly data: Map<string, unknown>;
  failWrites: boolean;
}

export function fakeIndexedDb(): FakeIndexedDb {
  const data = new Map<string, unknown>();
  const later = (run: () => void): void => void setTimeout(run, 0);
  const fake: FakeIndexedDb = { factory: undefined as unknown as IDBFactory, data, failWrites: false };
  const db = {
    createObjectStore: () => undefined,
    close: () => undefined,
    transaction: () => {
      let failed = false;
      const write = (run: () => void): void => {
        if (fake.failWrites) failed = true;
        else run();
      };
      const store = {
        put: (value: unknown, key: string) => {
          write(() => data.set(key, value));
          return { result: key };
        },
        get: (key: string) => ({ result: data.get(key) }),
        delete: (key: string) => {
          write(() => data.delete(key));
          return { result: undefined };
        },
        getAllKeys: () => ({ result: [...data.keys()] }),
        clear: () => {
          write(() => data.clear());
          return { result: undefined };
        },
      };
      const tx: { objectStore: () => typeof store; oncomplete?: () => void; onerror?: () => void; error: Error | null } = { objectStore: () => store, error: null };
      later(() => {
        if (failed) {
          tx.error = new Error('QuotaExceededError');
          tx.onerror?.();
        } else tx.oncomplete?.();
      });
      return tx;
    },
  };
  (fake as { factory: IDBFactory }).factory = {
    open: () => {
      const request: { result: typeof db; onupgradeneeded?: () => void; onsuccess?: () => void } = { result: db };
      later(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  } as unknown as IDBFactory;
  return fake;
}
