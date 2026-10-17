import { HttpException } from "@nestjs/common";
import type { z } from "zod";
import { zodFieldErrors, type FieldError } from "../../src/common/errors";

/** Shared customer/vendor request fixtures and assertion helpers (partner unit tests). */

export const address = (overrides: Record<string, unknown> = {}) => ({
  name: "HQ",
  address: "1 Road",
  countryCode: "TH",
  state: "Bangkok",
  city: "Bangkok",
  postcode: "10110",
  isDefault: false,
  ...overrides,
});

export const invoiceAddress = (overrides: Record<string, unknown> = {}) => address({ taxId: null, ...overrides });

export const scalars = (overrides: Record<string, unknown> = {}) => ({
  name: "Acme",
  code: "C001",
  currencyCode: "THB",
  active: true,
  firstName: "Ann",
  middleName: null,
  lastName: null,
  phone: null,
  email: "ann@example.com",
  ...overrides,
});

export const customerBody = (overrides: Record<string, unknown> = {}) => ({
  ...scalars(),
  invoiceAddresses: [invoiceAddress({ isDefault: true })],
  shippingAddresses: [address({ isDefault: true })],
  ...overrides,
});

export const vendorBody = (overrides: Record<string, unknown> = {}) => ({
  ...scalars({ code: "V001" }),
  invoiceAddresses: [invoiceAddress({ isDefault: true })],
  ...overrides,
});

export const EXPECTED = "2026-10-16T00:00:00.000Z";
export const withVersion = <T extends object>(body: T, expectedUpdatedAt = EXPECTED) => ({ expectedUpdatedAt, ...body });

/** Contract field errors (`{path, code}`) of a failed parse; `[]` when valid. */
export function fieldErrors(schema: z.ZodType, value: unknown): FieldError[] {
  const parsed = schema.safeParse(value);
  return parsed.success ? [] : zodFieldErrors(parsed.error);
}

/** Status, partner envelope code and field errors of a thrown partner exception. */
export async function failure(promise: Promise<unknown> | (() => unknown)) {
  try {
    await (typeof promise === "function" ? promise() : promise);
  } catch (error) {
    if (error instanceof HttpException) {
      const body = error.getResponse() as { error: { code: string; fieldErrors?: FieldError[] } };
      return { status: error.getStatus(), code: body.error.code, fieldErrors: body.error.fieldErrors ?? [] };
    }
    throw error;
  }
  throw new Error("expected the call to fail");
}
