import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @upstash/redis's Redis class — we don't want the tests to hit a real
// Redis instance, and Redis.fromEnv() would throw on missing env in CI.
const incrMock = vi.fn();
const expireMock = vi.fn();

vi.mock("@upstash/redis", () => ({
  Redis: class MockRedis {
    static fromEnv() {
      return new MockRedis();
    }
    incr(...args: unknown[]) {
      return incrMock(...args);
    }
    expire(...args: unknown[]) {
      return expireMock(...args);
    }
  },
}));

import { UpstashDurableRateLimitStore } from "../upstash";

describe("UpstashDurableRateLimitStore", () => {
  beforeEach(() => {
    incrMock.mockReset();
    expireMock.mockReset();
  });

  it("returns the post-increment count from INCR", async () => {
    incrMock.mockResolvedValueOnce(2);
    const store = new UpstashDurableRateLimitStore();
    const count = await store.increment("partner-magic:test@example.com", 3600);
    expect(count).toBe(2);
    expect(incrMock).toHaveBeenCalledTimes(1);
    expect(incrMock).toHaveBeenCalledWith("partner-magic:test@example.com");
  });

  it("stamps TTL on first set (INCR returns 1)", async () => {
    incrMock.mockResolvedValueOnce(1);
    const store = new UpstashDurableRateLimitStore();
    await store.increment("partner-magic:test@example.com", 3600);
    expect(expireMock).toHaveBeenCalledTimes(1);
    expect(expireMock).toHaveBeenCalledWith("partner-magic:test@example.com", 3600);
  });

  it("does NOT stamp TTL on subsequent sets (INCR returns > 1)", async () => {
    incrMock.mockResolvedValueOnce(2);
    const store = new UpstashDurableRateLimitStore();
    await store.increment("partner-magic:test@example.com", 3600);
    expect(expireMock).not.toHaveBeenCalled();
  });

  it("propagates Upstash errors to the caller", async () => {
    incrMock.mockRejectedValueOnce(new Error("Upstash down"));
    const store = new UpstashDurableRateLimitStore();
    await expect(
      store.increment("partner-magic:test@example.com", 3600),
    ).rejects.toThrow("Upstash down");
  });
});
