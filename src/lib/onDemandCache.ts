// Per-mounted-page cache. A read happens once per key, or explicitly on Refresh.
export class OnDemandCache<T> {
  private values = new Map<string, T>();
  private pending = new Map<string, Promise<T>>();
  get(key: string) { return this.values.get(key); }
  invalidate(key: string) { this.values.delete(key); }
  read(key: string, load: () => Promise<T>) {
    if (this.values.has(key)) return Promise.resolve(this.values.get(key)!);
    const existing = this.pending.get(key);
    if (existing) return existing;
    const request = Promise.resolve().then(load).then((data) => { this.values.set(key, data); return data; }).finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }
}
