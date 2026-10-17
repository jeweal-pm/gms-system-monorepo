import { TRPCClientError } from "@trpc/client";
import type { z } from "zod";

/** Shared fixtures for the Partner Master (customer / vendor) unit tests, 2026-10-16. */

type GatewayErrorInit = {
  domainCode?: string;
  fieldErrors?: { path: string; code: string }[];
  httpStatus?: number;
  /** tRPC error code key (`data.code`). */
  code?: string;
  /** Raw server message; mappers must never show it. */
  message?: string;
};

/**
 * A real `TRPCClientError` in the gateway errorFormatter envelope
 * (`data.code`, `data.httpStatus`, `data.domainCode`, `data.fieldErrors`).
 */
export function gatewayError({ domainCode, fieldErrors, httpStatus = 400, code = "BAD_REQUEST", message = "raw server text" }: GatewayErrorInit): TRPCClientError<never> {
  const data: Record<string, unknown> = { code, httpStatus };
  if (domainCode !== undefined) data.domainCode = domainCode;
  if (fieldErrors !== undefined) data.fieldErrors = fieldErrors;
  return new TRPCClientError(message, { result: { error: { code: -32600, message, data } } } as never);
}

/** First error message per dot-joined path (same helper as test/company-profile/schema.test.ts). */
export function issuesByPath(schema: z.ZodType, values: unknown): Record<string, string> {
  const result = schema.safeParse(values);
  if (result.success) return {};
  const byPath: Record<string, string> = {};
  for (const issue of result.error.issues) byPath[issue.path.join(".")] ??= issue.message;
  return byPath;
}

/** A complete, valid address item. */
export function validAddress(overrides: Partial<{ id: string | null; name: string; taxId: string; address: string; countryCode: string; state: string; city: string; postcode: string; isDefault: boolean }> = {}) {
  return {
    id: null,
    name: "Test Co., Ltd.",
    taxId: "",
    address: "1 Road",
    countryCode: "TH",
    state: "Bangkok",
    city: "Bangkok",
    postcode: "10110",
    isDefault: true,
    ...overrides,
  };
}

/** Valid Partner Information values (code … email). */
export function validInfo() {
  return {
    code: "C001",
    name: "Test Co., Ltd.",
    currencyCode: "THB",
    active: true,
    firstName: "Somchai",
    middleName: "",
    lastName: "",
    phone: { country: "US", number: "" },
    email: "buyer@example.com",
  };
}
