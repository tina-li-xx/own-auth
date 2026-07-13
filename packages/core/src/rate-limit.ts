import { AuthError } from "./errors.js";

export interface RateLimitResult {
  count: number;
  resetAt: Date;
  allowed: boolean;
}

export interface RateLimitStore {
  /** Atomically increments a bucket and returns the count after this hit. */
  hit(key: string, windowMs: number, limit: number): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

interface Bucket {
  count: number;
  resetAt: Date;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();

  async hit(key: string, windowMs: number, limit: number): Promise<RateLimitResult> {
    const now = Date.now();
    const existing = this.buckets.get(key);

    if (!existing || existing.resetAt.getTime() <= now) {
      const bucket = {
        count: 1,
        resetAt: new Date(now + windowMs)
      };
      this.buckets.set(key, bucket);
      return { ...bucket, allowed: true };
    }

    existing.count += 1;
    this.buckets.set(key, existing);

    return {
      count: existing.count,
      resetAt: existing.resetAt,
      allowed: existing.count <= limit
    };
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }
}

export async function enforceRateLimit(
  store: RateLimitStore,
  options: {
    key: string;
    limit: number;
    windowMs: number;
  }
): Promise<void> {
  const result = await store.hit(options.key, options.windowMs, options.limit);

  if (!result.allowed) {
    throw new AuthError("rate_limited", "Too many attempts. Try again later.", 429);
  }
}
