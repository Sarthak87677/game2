/** Serialises calls with a minimum spacing (public geocoder fair-use policies typically demand ≤ 1 request/second). */
export class RateLimiter {
  private chain: Promise<unknown> = Promise.resolve();
  private last = 0;
  constructor(private minIntervalMs: number) {}
  run<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(async () => {
      const wait = this.last + this.minIntervalMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.last = Date.now();
      return fn();
    });
    this.chain = p.catch(() => undefined);
    return p;
  }
}

export async function fetchJsonWithTimeout(fetchImpl: typeof fetch, url: string, timeoutMs: number, init: RequestInit = {}): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}
