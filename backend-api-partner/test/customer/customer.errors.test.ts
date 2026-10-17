import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { customerCodeTaken, customerNotFound, customerStale, mapPersistenceError } from "../../src/customer/customer.errors";
import { prismaError } from "../partner-shared/prisma-fake";

/** UT-CUS-P60…P66: customer error envelopes and Prisma/driver error mapping (error-handling.md "Partner implementation rules"). */

function envelope(error: unknown) {
  expect(error).toBeInstanceOf(HttpException);
  const http = error as HttpException;
  return { status: http.getStatus(), body: http.getResponse() };
}

describe("customer error envelopes", () => {
  it("UT-CUS-P60 have fixed codes, statuses and messages without request data", () => {
    expect(envelope(customerNotFound())).toEqual({ status: 404, body: { error: { code: "CUSTOMER_NOT_FOUND", message: "The customer was not found" } } });
    expect(envelope(customerStale())).toEqual({ status: 409, body: { error: { code: "CUSTOMER_STALE", message: "The customer was changed by someone else" } } });
    expect(envelope(customerCodeTaken())).toEqual({
      status: 409, body: { error: { code: "CUSTOMER_CODE_TAKEN", message: "This code name is already used", fieldErrors: [{ path: "code", code: "duplicate" }] } },
    });
  });
});

describe("mapPersistenceError", () => {
  it.each([
    ["driver-adapter constraint index", { driverAdapterError: { cause: { constraint: { index: "customer_code_key_key" } } } }],
    ["classic target column", { target: ["code_key"] }],
  ])("UT-CUS-P61 maps P2002 on code_key (%s) to 409 CUSTOMER_CODE_TAKEN", (_label, meta) => {
    expect(envelope(mapPersistenceError(prismaError("P2002", meta), "create"))).toMatchObject({ status: 409, body: { error: { code: "CUSTOMER_CODE_TAKEN", fieldErrors: [{ path: "code", code: "duplicate" }] } } });
  });

  it("UT-CUS-P62 maps P2002 on an address index (position/default invariant) to 500 without detail", () => {
    const error = mapPersistenceError(prismaError("P2002", { target: ["customer_id", "type", "position"] }), "update");
    expect(envelope(error)).toEqual({ status: 500, body: { error: { code: "INTERNAL_SERVER_ERROR", message: "The request could not be completed" } } });
    expect(envelope(mapPersistenceError(prismaError("P2002"), "create")).status).toBe(500);
  });

  it("UT-CUS-P63 maps P2025 to 404 CUSTOMER_NOT_FOUND", () => {
    expect(envelope(mapPersistenceError(prismaError("P2025"), "update")).body).toMatchObject({ error: { code: "CUSTOMER_NOT_FOUND" } });
  });

  it.each(["P1001", "P2024", "P2028"])("UT-CUS-P64 maps %s to 503 PARTNER_UNAVAILABLE", (code) => {
    expect(envelope(mapPersistenceError(prismaError(code), "list"))).toMatchObject({ status: 503, body: { error: { code: "PARTNER_UNAVAILABLE" } } });
  });

  it("UT-CUS-P65 passes partner HTTP exceptions through unchanged", () => {
    const stale = customerStale();
    expect(mapPersistenceError(stale, "update")).toBe(stale);
  });

  it("UT-CUS-P66 returns unknown errors unchanged (the global filter turns them into 500)", () => {
    const error = new Error("boom");
    expect(mapPersistenceError(error, "get")).toBe(error);
    expect(mapPersistenceError(prismaError("P9999x"), "get")).toBeInstanceOf(Error);
  });
});
