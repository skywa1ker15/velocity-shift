/** Minimal typed event emitter. Listeners are called synchronously in registration order. */
export class Emitter<T extends Record<string, any>> {
  private map = new Map<keyof T, Set<(p: any) => void>>();

  on<K extends keyof T>(type: K, fn: (payload: T[K]) => void): () => void {
    let set = this.map.get(type);
    if (!set) this.map.set(type, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit<K extends keyof T>(type: K, payload: T[K]): void {
    const set = this.map.get(type);
    if (!set) return;
    for (const fn of set) fn(payload);
  }

  clear() {
    this.map.clear();
  }
}
