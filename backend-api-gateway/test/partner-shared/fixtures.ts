import { TRPCError } from "@trpc/server";
import type { z } from "zod";
import { describeError } from "../../src/trpc/domain-error";
import { appRouter, type TrpcContext } from "../../src/trpc/router";

/** Shared customer/vendor fixtures and helpers for the gateway unit tests. */

export const ID = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0e";
export const EXPECTED = "2026-10-16T00:00:00.000Z";

export const address = (overrides: Record<string, unknown> = {}) => ({
  name: "HQ", address: "1 Road", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10110", isDefault: false, ...overrides,
});
export const invoiceAddress = (overrides: Record<string, unknown> = {}) => address({ taxId: null, ...overrides });

export const scalars = (overrides: Record<string, unknown> = {}) => ({
  name: "Acme", code: "C001", currencyCode: "THB", active: true, firstName: "Ann", middleName: null, lastName: null, phone: null, email: "ann@example.com", ...overrides,
});

export const customerInput = (overrides: Record<string, unknown> = {}) => ({
  ...scalars(), invoiceAddresses: [invoiceAddress({ isDefault: true })], shippingAddresses: [address({ isDefault: true })], ...overrides,
});
export const vendorInput = (overrides: Record<string, unknown> = {}) => ({
  ...scalars({ code: "V001" }), invoiceAddresses: [invoiceAddress({ isDefault: true })], ...overrides,
});
export const withMeta = <T extends object>(input: T) => ({ id: ID, expectedUpdatedAt: EXPECTED, ...input });

const addressOut = (n: number) => ({ id: `a${n}`, position: n, name: "HQ", address: "1 Road", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10110", isDefault: n === 1 });
const detailScalars = (code: string) => ({
  id: ID, name: "Acme", code, active: true, updatedAt: EXPECTED, currencyCode: "THB", firstName: "Ann", middleName: null, lastName: null, phone: null, email: "ann@example.com",
});
export const customerDetail = () => ({ ...detailScalars("C001"), invoiceAddresses: [{ ...addressOut(1), taxId: null }], shippingAddresses: [addressOut(1)], createdAt: EXPECTED });
export const vendorDetail = () => ({ ...detailScalars("V001"), invoiceAddresses: [{ ...addressOut(1), taxId: "0105" }], createdAt: EXPECTED });

/** Field errors as the router's errorFormatter would report them for a schema failure. */
export function formatted(schema: z.ZodType, input: unknown) {
  const parsed = schema.safeParse(input);
  if (parsed.success) return null;
  return describeError(new TRPCError({ code: "BAD_REQUEST", cause: parsed.error }));
}

export function caller(permissions: string[] = [], options: { superAdmin?: boolean; session?: boolean; license?: string } = {}) {
  const ctx: TrpcContext = {
    session: options.session === false ? null : { user: { id: "user-1", username: "admin", email: "x@users.invalid", name: "Admin" } },
    license: { state: (options.license ?? "VALID") as NonNullable<TrpcContext["license"]>["state"] },
    authz: { isSuperAdmin: options.superAdmin ?? false, permissions },
    cookie: "session=1",
    activateLicense: null,
  };
  return appRouter.createCaller(ctx);
}

/** tRPC code, domain code and field errors of a rejected call. */
export async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TRPCError) return { code: error.code, ...describeError(error) };
    throw error;
  }
  throw new Error("expected the call to fail");
}

export const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
