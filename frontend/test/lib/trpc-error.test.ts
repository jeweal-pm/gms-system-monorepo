import { TRPCClientError } from "@trpc/client";
import { describe, expect, it } from "vitest";
import { retryServiceRead, retryTransient, serviceRestartRetryDelay } from "@/lib/trpc-error";

function clientError(httpStatus: number, domainCode: string) {
  return new TRPCClientError("Request failed", {
    result: {
      error: {
        code: -32603,
        message: "Request failed",
        data: { code: "INTERNAL_SERVER_ERROR", httpStatus, domainCode },
      },
    } as never,
  });
}

describe("transient tRPC read retries", () => {
  it("keeps the existing short retry bound for ordinary reads", () => {
    const error = new Error("Bad Gateway");
    expect(retryTransient(0, error)).toBe(true);
    expect(retryTransient(1, error)).toBe(true);
    expect(retryTransient(2, error)).toBe(false);
  });

  it("bounds recovery reads to twelve retries for a restarting API", () => {
    const error = clientError(502, "DEPENDENCY_UNAVAILABLE");
    for (let failureCount = 0; failureCount < 12; failureCount += 1) {
      expect(retryServiceRead(failureCount, error)).toBe(true);
    }
    expect(retryServiceRead(12, error)).toBe(false);
  });

  it.each([401, 403, 404])("does not retry HTTP %i", (httpStatus) => {
    expect(retryServiceRead(0, clientError(httpStatus, "REQUEST_FAILED"))).toBe(false);
  });

  it("does not retry license decisions", () => {
    expect(retryServiceRead(0, clientError(403, "LICENSE_REVOKED"))).toBe(false);
  });

  it("backs off and caps the retry cadence at eight seconds", () => {
    expect([0, 1, 2, 3, 4, 5, 11].map(serviceRestartRetryDelay)).toEqual([1_000, 2_000, 4_000, 8_000, 8_000, 8_000, 8_000]);
  });
});
