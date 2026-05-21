/**
 * In-memory Storage implementation for tests.
 *
 * Production uses window.localStorage directly via Deps.storage.
 * Tests pass createInMemoryStorage() so each test starts with a clean slate.
 *
 * Status: Phase 2 scaffold — real impl + tests land in Phase 3.
 */

export const createInMemoryStorage = (): Storage => {
  const data = new Map<string, string>();
  return {
    get length(): number {
      return data.size;
    },
    clear(): void {
      data.clear();
    },
    getItem(key: string): string | null {
      return data.get(key) ?? null;
    },
    key(index: number): string | null {
      return Array.from(data.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      data.delete(key);
    },
    setItem(key: string, value: string): void {
      data.set(key, String(value));
    },
  };
};
