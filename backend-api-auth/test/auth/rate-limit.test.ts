import { describe, expect, it } from "vitest";
import { AUTH_RATE_LIMIT_RULES, SIGN_IN_PATH } from "../../src/auth/rate-limit";

/** INV-20261102-001: normal navigation must not exhaust the session check; sign-in stays strict. */
describe("auth rate limit rules", () => {
  it("UT-AUTH-RL1 the session check has its own bucket well above a busy page load rate; sign-in keeps 5 / min", () => {
    expect(AUTH_RATE_LIMIT_RULES["/get-session"]).toEqual({ window: 60, max: 600 });
    expect(AUTH_RATE_LIMIT_RULES[SIGN_IN_PATH]).toEqual({ window: 60, max: 5 });
    expect(SIGN_IN_PATH).toBe("/sign-in/username");
    expect(AUTH_RATE_LIMIT_RULES["/jwks"]).toBe(false);
  });
});
