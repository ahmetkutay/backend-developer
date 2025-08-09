// Simple wrapper over opossum circuit breaker with per-call breakers (minimal footprint)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeWithBreaker<T>(name: string, action: () => Promise<T>, options: any, enabled: boolean): Promise<T> {
  if (!enabled) return action();
  // Use require to avoid type issues if @types are absent
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const CircuitBreaker = require('opossum');
  const breaker = new CircuitBreaker(async () => action(), options);
  try {
    const result = await breaker.fire();
    return result as T;
  } finally {
    try { breaker.close(); } catch {}
  }
}
