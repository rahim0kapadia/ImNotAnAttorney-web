import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { envWithWarn, __resetEnvWarnCache } from "../env-check";

describe("envWithWarn", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const KEY = "__TEST_ENV_WARN_KEY";

  beforeEach(() => {
    delete process.env[KEY];
    __resetEnvWarnCache();
  });

  afterEach(() => {
    delete process.env[KEY];
    if (originalNodeEnv === undefined) {
      delete (process.env as Record<string, string | undefined>).NODE_ENV;
    } else {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    }
  });

  it("returns the env var value when set", () => {
    process.env[KEY] = "real-value";
    expect(envWithWarn(KEY, "fallback")).toBe("real-value");
  });

  it("returns the fallback when env var is unset", () => {
    expect(envWithWarn(KEY, "fallback")).toBe("fallback");
  });

  it("returns the fallback when env var is empty string", () => {
    process.env[KEY] = "";
    expect(envWithWarn(KEY, "fallback")).toBe("fallback");
  });

  it("returns the fallback when env var is whitespace only", () => {
    process.env[KEY] = "   ";
    expect(envWithWarn(KEY, "fallback")).toBe("fallback");
  });

  it("warns once in production when env is missing", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    envWithWarn(KEY, "fallback");
    envWithWarn(KEY, "fallback");
    envWithWarn(KEY, "fallback");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("ENV-MISSING");
    expect(spy.mock.calls[0][0]).toContain(KEY);
    expect(spy.mock.calls[0][0]).toContain("fallback");
    spy.mockRestore();
  });

  it("does not warn in development even when env is missing", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    envWithWarn(KEY, "fallback");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does not warn when env var IS set, even in production", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env[KEY] = "real-value";
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    envWithWarn(KEY, "fallback");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
