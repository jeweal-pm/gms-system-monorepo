import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { mapPersistenceError, vendorCodeTaken, vendorNotFound, vendorStale } from "../../src/vendor/vendor.errors";
import { prismaError } from "../partner-shared/prisma-fake";

/** UT-VEN-P50…P55: vendor error envelopes and Prisma/driver error mapping (vendor error-handling.md). */

function envelope(error: unknown) {
  expect(error).toBeInstanceOf(HttpException);
  const http = error as HttpException;
  return { status: http.getStatus(), body: http.getResponse() };
}

describe("vendor error envelopes", () => {
  it("UT-VEN-P50 have fixed codes, statuses and messages", () => {
    expect(envelope(vendorNotFound())).toEqual({ status: 404, body: { error: { code: "VENDOR_NOT_FOUND", message: "The vendor was not found" } } });
    expect(envelope(vendorStale())).toEqual({ status: 409, body: { error: { code: "VENDOR_STALE", message: "The vendor was changed by someone else" } } });
    expect(envelope(vendorCodeTaken())).toEqual({
      status: 409, body: { error: { code: "VENDOR_CODE_TAKEN", message: "This code name is already used", fieldErrors: [{ path: "code", code: "duplicate" }] } },
    });
  });
});

describe("mapPersistenceError", () => {
  it.each([
    ["driver-adapter constraint index", { driverAdapterError: { cause: { constraint: { index: "vendor_code_key_key" } } } }],
    ["classic target column", { target: ["code_key"] }],
  ])("UT-VEN-P51 maps P2002 on code_key (%s) to 409 VENDOR_CODE_TAKEN", (_label, meta) => {
    expect(envelope(mapPersistenceError(prismaError("P2002", meta), "create"))).toMatchObject({ status: 409, body: { error: { code: "VENDOR_CODE_TAKEN" } } });
  });

  it.each([
    ["position index", { driverAdapterError: { cause: { constraint: { index: "vendor_address_position_key" } } } }],
    ["one-default index", { driverAdapterError: { cause: { constraint: { index: "vendor_address_one_default_key" } } } }],
  ])("UT-VEN-P52 maps P2002 on the %s to 500 (invariant violation, no detail)", (_label, meta) => {
    expect(envelope(mapPersistenceError(prismaError("P2002", meta), "update"))).toEqual({ status: 500, body: { error: { code: "INTERNAL_SERVER_ERROR", message: "The request could not be completed" } } });
  });

  it("UT-VEN-P53 maps P2025 to 404 VENDOR_NOT_FOUND", () => {
    expect(envelope(mapPersistenceError(prismaError("P2025"), "delete"))).toMatchObject({ status: 404, body: { error: { code: "VENDOR_NOT_FOUND" } } });
  });

  it("UT-VEN-P54 maps connection/pool failures to 503 PARTNER_UNAVAILABLE", () => {
    expect(envelope(mapPersistenceError(prismaError("P1001"), "list")).status).toBe(503);
    expect(envelope(mapPersistenceError(new Error("Connection terminated unexpectedly"), "list")).status).toBe(503);
  });

  it("UT-VEN-P55 returns partner exceptions and unknown errors unchanged", () => {
    const stale = vendorStale();
    expect(mapPersistenceError(stale, "update")).toBe(stale);
    const error = new TypeError("x");
    expect(mapPersistenceError(error, "get")).toBe(error);
  });
});
