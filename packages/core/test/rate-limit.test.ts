import { describe, expect, it } from "vitest";
import { InMemoryRateLimitStore, enforceRateLimit } from "../src/rate-limit.js";

describe("InMemoryRateLimitStore", () => {
  it("allows hits within the limit", async () => {
    const store = new InMemoryRateLimitStore();
    const r1 = await store.hit("key", 60_000, 3);
    const r2 = await store.hit("key", 60_000, 3);
    const r3 = await store.hit("key", 60_000, 3);

    expect(r1.allowed).toBe(true);
    expect(r1.count).toBe(1);
    expect(r2.allowed).toBe(true);
    expect(r2.count).toBe(2);
    expect(r3.allowed).toBe(true);
    expect(r3.count).toBe(3);
  });

  it("rejects hits over the limit", async () => {
    const store = new InMemoryRateLimitStore();
    await store.hit("key", 60_000, 2);
    await store.hit("key", 60_000, 2);
    const r3 = await store.hit("key", 60_000, 2);

    expect(r3.allowed).toBe(false);
    expect(r3.count).toBe(3);
  });

  it("tracks separate keys independently", async () => {
    const store = new InMemoryRateLimitStore();
    await store.hit("a", 60_000, 1);
    const r = await store.hit("b", 60_000, 1);

    expect(r.allowed).toBe(true);
    expect(r.count).toBe(1);
  });

  it("resets a key", async () => {
    const store = new InMemoryRateLimitStore();
    await store.hit("key", 60_000, 1);
    await store.hit("key", 60_000, 1);
    await store.reset("key");

    const r = await store.hit("key", 60_000, 1);
    expect(r.allowed).toBe(true);
    expect(r.count).toBe(1);
  });

  it("resets the bucket after the window expires", async () => {
    const store = new InMemoryRateLimitStore();
    const r1 = await store.hit("key", 1, 1);
    expect(r1.allowed).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const r2 = await store.hit("key", 1, 1);
    expect(r2.allowed).toBe(true);
    expect(r2.count).toBe(1);
  });

  it("returns a resetAt date in the future", async () => {
    const store = new InMemoryRateLimitStore();
    const r = await store.hit("key", 60_000, 5);
    expect(r.resetAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("counts concurrent hits without dropping increments", async () => {
    const store = new InMemoryRateLimitStore();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => store.hit("concurrent", 60_000, 10))
    );

    expect(results.map((result) => result.count).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1)
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(10);
  });
});

describe("enforceRateLimit", () => {
  it("does not throw within the limit", async () => {
    const store = new InMemoryRateLimitStore();
    await expect(
      enforceRateLimit(store, { key: "test", limit: 3, windowMs: 60_000 })
    ).resolves.toBeUndefined();
  });

  it("throws rate_limited when over the limit", async () => {
    const store = new InMemoryRateLimitStore();
    await enforceRateLimit(store, { key: "test", limit: 1, windowMs: 60_000 });

    await expect(
      enforceRateLimit(store, { key: "test", limit: 1, windowMs: 60_000 })
    ).rejects.toMatchObject({ code: "rate_limited" });
  });
});
