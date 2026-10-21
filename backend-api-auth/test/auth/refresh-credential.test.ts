import { describe, expect, it } from "vitest";
import { newRefreshSecret, refreshId, refreshSecretHash } from "../../src/auth/refresh-credential";

describe("GP-AT-03 refresh primitives", () => {
  it("generates independent 256-bit bearer secrets and stores only deterministic digests", () => {
    const first = newRefreshSecret();
    const second = newRefreshSecret();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(refreshSecretHash(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(refreshSecretHash(first)).toBe(refreshSecretHash(first));
    expect(refreshSecretHash(first)).not.toBe(refreshSecretHash(second));
    expect(() => refreshSecretHash("short")).toThrow();
  });

  it("generates application UUIDv7 IDs with the supplied millisecond timestamp", () => {
    const id = refreshId(1_700_000_000_000);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id.replaceAll("-", "").slice(0, 12)).toBe("018bcfe56800");
    expect(refreshId(1_700_000_000_000)).not.toBe(id);
    expect(() => refreshId(-1)).toThrow();
  });
});
