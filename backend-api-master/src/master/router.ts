import { HttpException } from "@nestjs/common";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { createCustomerBodySchema, updateCustomerBodySchema } from "../customer/customer.schemas";
import type { CustomerService } from "../customer/customer.service";
import { createVendorBodySchema, updateVendorBodySchema } from "../vendor/vendor.schemas";
import type { VendorService } from "../vendor/vendor.service";
import type { CompanyProfileService } from "../company-profile/company-profile.service";
import { saveCompanyProfileBodySchema } from "../company-profile/company-profile.schemas";
import type { StoneMasterService } from "../stone-master/stone-master.service";
import type { DocumentSetupService } from "../document-setup/document-setup.service";
import { saveDocumentSetupBodySchema, transactionKeySchema } from "../document-setup/document-setup.schemas";
import { bodySchemasFor, optionsQuerySchema } from "../stone-master/stone-master.schemas";
import type { StoneKind } from "../stone-master/stone-master.kinds";
import type { CurrencyService } from "../currency/currency.service";
import { createCurrencyBodySchema, updateCurrencyBodySchema } from "../currency/currency.schemas";
import type { QuotationService } from "../quotation/quotation.service";
import {
  createQuotationSchema,
  nextNumberSchema,
  quotationListSchema,
  reasonedIdSchema,
  updateQuotationSchema,
  versionedIdSchema,
} from "../quotation/quotation.schemas";
import { LIST_LIMIT_MAX } from "../common/partner-schemas";
import { requireAnyMasterGrant, requireMasterGrant, type MasterAction, type MasterContext, type MasterMenu } from "./authorization";

// Staged router: do not mount until the auth-owned JWT/view/license context adapter is verified.
const t = initTRPC.context<MasterContext>().create({
  errorFormatter({ shape, error }) {
    const cause = error.cause;
    const envelope = cause instanceof HttpException ? cause.getResponse() : null;
    const detail = typeof envelope === "object" && envelope !== null && "error" in envelope
      ? (envelope as { error?: { code?: unknown; fieldErrors?: unknown } }).error : undefined;
    return {
      ...shape,
      data: {
        ...shape.data,
        domainCode: typeof detail?.code === "string" ? detail.code : error.code === "BAD_REQUEST" ? "VALIDATION_ERROR" : error.message,
        fieldErrors: Array.isArray(detail?.fieldErrors) ? detail.fieldErrors : undefined,
      },
    };
  },
});

const idInput = z.object({ id: z.uuid() }).strict();
const listInput = z.object({
  q: z.string().trim().max(100).optional(),
  active: z.boolean().optional(),
  cursor: z.string().max(200).nullish(),
  direction: z.enum(["forward", "backward"]).optional(),
  limit: z.number().int().min(1).max(LIST_LIMIT_MAX).default(LIST_LIMIT_MAX),
}).strict();
const stoneOptionsInput = z.object({
  kinds: z.array(z.enum(["group", "size", "shape", "color", "cutting", "clarity", "quality", "stone-name"])).min(1).max(8),
  include: z.array(z.uuid()).max(20).default([]),
}).strict();

function toListQuery(input: z.output<typeof listInput>) {
  return {
    ...(input.q ? { q: input.q } : {}),
    ...(input.active === undefined ? {} : { active: String(input.active) as "true" | "false" }),
    ...(input.cursor ? { cursor: input.cursor } : {}),
    limit: input.limit,
  };
}

function mapDomainError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const detail = typeof response === "object" && response !== null && "error" in response
      ? (response as { error?: { code?: unknown } }).error : undefined;
    const domainCode = typeof detail?.code === "string" ? detail.code : "DEPENDENCY_UNAVAILABLE";
    const code = error.getStatus() === 400 ? "BAD_REQUEST" : error.getStatus() === 404 ? "NOT_FOUND"
      : error.getStatus() === 409 ? "CONFLICT" : error.getStatus() === 422 ? "UNPROCESSABLE_CONTENT" : "SERVICE_UNAVAILABLE";
    throw new TRPCError({ code, message: domainCode, cause: error });
  }
  throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "DEPENDENCY_UNAVAILABLE" });
}

async function domainCall<T>(operation: () => T | Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) { return mapDomainError(error); }
}

function permitted(menu: MasterMenu, action: MasterAction, mutation = false) {
  return t.procedure.use(({ ctx, next }) => {
    const userId = requireMasterGrant(ctx, menu, action, mutation);
    return next({ ctx: { ...ctx, userId } });
  });
}

/** Read allowed with `action` on any of `menus` (currency SA-CUR-07: Quotation reads currency options). */
function permittedAny(menus: readonly MasterMenu[], action: MasterAction) {
  return t.procedure.use(({ ctx, next }) => {
    const userId = requireAnyMasterGrant(ctx, menus, action);
    return next({ ctx: { ...ctx, userId } });
  });
}

export type MasterServices = Pick<{
  customer: CustomerService;
  vendor: VendorService;
  companyProfile: CompanyProfileService;
  stoneMaster: StoneMasterService;
  documentSetup: DocumentSetupService;
  currency: CurrencyService;
  quotation: QuotationService;
}, "customer" | "vendor" | "companyProfile" | "stoneMaster" | "documentSetup" | "currency" | "quotation">;

function stoneProcedures(kind: StoneKind, service: StoneMasterService) {
  const schemas = bodySchemasFor(kind);
  return t.router({
    list: permitted("stone-master", "VIEW").input(listInput).query(({ input }) => domainCall(() => service.list(kind, toListQuery(input)))),
    get: permitted("stone-master", "VIEW").input(idInput).query(({ input }) => domainCall(() => service.get(kind, input.id))),
    create: permitted("stone-master", "ADD", true).input(schemas.create).mutation(({ ctx, input }) => domainCall(() => service.create(kind, ctx.userId, input))),
    update: permitted("stone-master", "EDIT", true).input(z.intersection(idInput, schemas.update)).mutation(({ ctx, input }) => {
      const { id, ...body } = input;
      return domainCall(() => service.update(kind, ctx.userId, id, body as { expectedUpdatedAt: string }));
    }),
    delete: permitted("stone-master", "DELETE", true).input(idInput).mutation(({ ctx, input }) => domainCall(() => service.delete(kind, ctx.userId, input.id))),
  });
}

/** Direct service calls preserve IDs, transaction behavior and existing partner/stone schemas. */
export function createMasterRouter({ customer, vendor, companyProfile, stoneMaster, documentSetup, currency, quotation }: MasterServices) {
  return t.router({
    customer: t.router({
      list: permitted("customer", "VIEW").input(listInput).query(({ input }) => domainCall(() => customer.list(toListQuery(input)))),
      get: permitted("customer", "VIEW").input(idInput).query(({ input }) => domainCall(() => customer.get(input.id))),
      options: permitted("customer", "VIEW").query(() => domainCall(() => customer.options())),
      nextCode: permitted("customer", "ADD").query(() => domainCall(() => customer.nextCode())),
      create: permitted("customer", "ADD", true).input(createCustomerBodySchema).mutation(({ ctx, input }) => domainCall(() => customer.create(ctx.userId, input))),
      update: permitted("customer", "EDIT", true).input(updateCustomerBodySchema.extend({ id: z.uuid() })).mutation(({ ctx, input }) => {
        const { id, ...body } = input;
        return domainCall(() => customer.update(ctx.userId, id, body));
      }),
      delete: permitted("customer", "DELETE", true).input(idInput).mutation(({ ctx, input }) => domainCall(() => customer.delete(ctx.userId, input.id))),
    }),
    vendor: t.router({
      list: permitted("vendor", "VIEW").input(listInput).query(({ input }) => domainCall(() => vendor.list(toListQuery(input)))),
      get: permitted("vendor", "VIEW").input(idInput).query(({ input }) => domainCall(() => vendor.get(input.id))),
      options: permitted("vendor", "VIEW").query(() => domainCall(() => vendor.options())),
      nextCode: permitted("vendor", "ADD").query(() => domainCall(() => vendor.nextCode())),
      create: permitted("vendor", "ADD", true).input(createVendorBodySchema).mutation(({ ctx, input }) => domainCall(() => vendor.create(ctx.userId, input))),
      update: permitted("vendor", "EDIT", true).input(updateVendorBodySchema.extend({ id: z.uuid() })).mutation(({ ctx, input }) => {
        const { id, ...body } = input;
        return domainCall(() => vendor.update(ctx.userId, id, body));
      }),
      delete: permitted("vendor", "DELETE", true).input(idInput).mutation(({ ctx, input }) => domainCall(() => vendor.delete(ctx.userId, input.id))),
    }),
    companyProfile: t.router({
      get: permitted("company-profile", "VIEW").query(() => domainCall(() => companyProfile.get())),
      options: permitted("company-profile", "VIEW").query(() => domainCall(() => companyProfile.options())),
      save: permitted("company-profile", "EDIT", true).input(saveCompanyProfileBodySchema).mutation(({ ctx, input }) => domainCall(() => companyProfile.save(ctx.userId, input))),
      removeLogo: permitted("company-profile", "EDIT", true).input(z.object({ expectedVersion: z.number().int().min(1) }).strict())
        .mutation(({ ctx, input }) => domainCall(() => companyProfile.removeLogo(ctx.userId, input.expectedVersion))),
    }),
    stoneMaster: t.router({
      options: permitted("stone-master", "VIEW").input(stoneOptionsInput).query(({ input }) => domainCall(() => stoneMaster.options(optionsQuerySchema.parse({ kinds: input.kinds.join(","), include: input.include.join(",") })))),
      group: stoneProcedures("group", stoneMaster),
      size: stoneProcedures("size", stoneMaster),
      color: stoneProcedures("color", stoneMaster),
      cutting: stoneProcedures("cutting", stoneMaster),
      clarity: stoneProcedures("clarity", stoneMaster),
      quality: stoneProcedures("quality", stoneMaster),
      stoneName: stoneProcedures("stone-name", stoneMaster),
      shape: stoneProcedures("shape", stoneMaster),
      stoneCode: stoneProcedures("stone-code", stoneMaster),
    }),
    // document-setup SA rev 1 (owner 2026-10-23): fixed transaction list, VIEW to read, EDIT to save.
    documentSetup: t.router({
      list: permitted("document-setup", "VIEW").query(() => domainCall(() => documentSetup.list())),
      get: permitted("document-setup", "VIEW").input(z.object({ transactionKey: transactionKeySchema }).strict())
        .query(({ input }) => domainCall(() => documentSetup.get(input.transactionKey))),
      save: permitted("document-setup", "EDIT", true).input(saveDocumentSetupBodySchema).mutation(({ ctx, input }) => domainCall(() => documentSetup.save(ctx.userId, input))),
    }),
    // currency SA rev 1 (owner 2026-10-26): currency master; rates are against the Company Profile currency.
    currency: t.router({
      list: permitted("currency", "VIEW").input(listInput).query(({ input }) => domainCall(() => currency.list({ q: input.q, cursor: input.cursor, limit: input.limit }))),
      get: permitted("currency", "VIEW").input(idInput).query(({ input }) => domainCall(() => currency.get(input.id))),
      options: permittedAny(["currency", "quotation"], "VIEW").query(() => domainCall(() => currency.options())),
      create: permitted("currency", "ADD", true).input(createCurrencyBodySchema).mutation(({ ctx, input }) => domainCall(() => currency.create(ctx.userId, input))),
      update: permitted("currency", "EDIT", true).input(updateCurrencyBodySchema.extend({ id: z.uuid() })).mutation(({ ctx, input }) => {
        const { id, ...body } = input;
        return domainCall(() => currency.update(ctx.userId, id, body));
      }),
      delete: permitted("currency", "DELETE", true).input(idInput).mutation(({ ctx, input }) => domainCall(() => currency.delete(ctx.userId, input.id))),
    }),
    // quotation SA rev 1 / ADR-0032 (owner 2026-10-26). Quotation has no approval (owner 2026-10-26); the status procedures stay unused by the UI.
    quotation: t.router({
      list: permitted("quotation", "VIEW").input(quotationListSchema).query(({ input }) => domainCall(() => quotation.list(input))),
      get: permitted("quotation", "VIEW").input(idInput).query(({ input }) => domainCall(() => quotation.get(input.id))),
      nextNumber: permitted("quotation", "VIEW").input(nextNumberSchema).query(({ input }) => domainCall(() => quotation.nextNumber(input.docDate))),
      options: permitted("quotation", "VIEW").input(z.object({ customerId: z.uuid().optional() }).strict())
        .query(({ input }) => domainCall(() => quotation.options(input.customerId))),
      create: permitted("quotation", "ADD", true).input(createQuotationSchema).mutation(({ ctx, input }) => domainCall(() => quotation.create(ctx.userId, input))),
      update: permitted("quotation", "EDIT", true).input(updateQuotationSchema).mutation(({ ctx, input }) => {
        const { id, expectedVersion, ...body } = input;
        return domainCall(() => quotation.update(ctx.userId, id, expectedVersion, body));
      }),
      submit: permitted("quotation", "EDIT", true).input(versionedIdSchema).mutation(({ ctx, input }) => domainCall(() => quotation.submit(ctx.userId, input.id, input.expectedVersion))),
      approve: permitted("quotation", "APPROVE", true).input(versionedIdSchema).mutation(({ ctx, input }) => domainCall(() => quotation.approve(ctx.userId, input.id, input.expectedVersion))),
      reject: permitted("quotation", "APPROVE", true).input(reasonedIdSchema).mutation(({ ctx, input }) => domainCall(() => quotation.reject(ctx.userId, input.id, input.expectedVersion, input.reason))),
      cancel: permitted("quotation", "CANCEL", true).input(reasonedIdSchema).mutation(({ ctx, input }) => domainCall(() => quotation.cancel(ctx.userId, input.id, input.expectedVersion, input.reason))),
      delete: permitted("quotation", "DELETE", true).input(versionedIdSchema).mutation(({ ctx, input }) => domainCall(() => quotation.delete(ctx.userId, input.id, input.expectedVersion))),
    }),
  });
}

export type MasterRouter = ReturnType<typeof createMasterRouter>;
