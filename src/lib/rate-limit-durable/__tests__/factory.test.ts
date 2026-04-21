import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDurableRateLimitStore, __resetDurableStoreCache } from "../factory";
import { NoopDurableRateLimitStore } from "../noop";

describe("getDurableRateLimitStore", () => {
  const originalProvider = process.env.DURABLE_RL_PROVIDER;

  beforeEach(() => {
    __resetDurableStoreCache();
    delete process.env.DURABLE_RL_PROVIDER;
  });

  afterEach(() => {
    __resetDurableStoreCache();
    if (originalProvider === undefined) {
      delete process.env.DURABLE_RL_PROVIDER;
    } else {
      process.env.DURABLE_RL_PROVIDER = originalProvider;
    }
  });

  it("returns no-op when env is unset", () => {
    const store = getDurableRateLimitStore();
    expect(store).toBeInstanceOf(NoopDurableRateLimitStore);
  });

  it("returns no-op when env is 'none'", () => {
    process.env.DURABLE_RL_PROVIDER = "none";
    const store = getDurableRateLimitStore();
    expect(store).toBeInstanceOf(NoopDurableRateLimitStore);
  });

  it("is case-insensitive + trim-tolerant on provider name", () => {
    process.env.DURABLE_RL_PROVIDER = "  NONE  ";
    const store = getDurableRateLimitStore();
    expect(store).toBeInstanceOf(NoopDurableRateLimitStore);
  });

  it("throws with wiring instructions when upstash is configured but not implemented", () => {
    process.env.DURABLE_RL_PROVIDER = "upstash";
    expect(() => getDurableRateLimitStore()).toThrow(/upstash/i);
    expect(() => getDurableRateLimitStore()).toThrow(/not.*implemented|src\/lib\/rate-limit-durable/i);
  });

  it("throws with wiring instructions when vercel-kv is configured but not implemented", () => {
    process.env.DURABLE_RL_PROVIDER = "vercel-kv";
    expect(() => getDurableRateLimitStore()).toThrow(/vercel-kv/i);
  });

  it("throws with clear error on unknown provider", () => {
    process.env.DURABLE_RL_PROVIDER = "memcached";
    expect(() => getDurableRateLimitStore()).toThrow(/not a known value/i);
  });

  it("no-op's increment throws the NOOP_DURABLE_STORE sentinel", async () => {
    const store = new NoopDurableRateLimitStore();
    await expect(store.increment("k", 60)).rejects.toThrow("NOOP_DURABLE_STORE");
  });
});
