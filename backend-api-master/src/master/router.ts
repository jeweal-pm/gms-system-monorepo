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
import type { DecimalSetupService } from "../decimal-setup/decimal-setup.service";
import { saveDecimalSetupBodySchema } from "../decimal-setup/decimal-setup.schemas";
import type { ApprovalSettingService } from "../approval-setting/approval-setting.service";
import { approvalSettingListSchema, approvalSettingUpdateSchema } from "../approval-setting/approval-setting.schemas";
import { bodySchemasFor, optionsQuerySchema } from "../stone-master/stone-master.schemas";
import type { StoneKind } from "../stone-master/stone-master.kinds";
import type { CurrencyService } from "../currency/currency.service";
import { createCurrencyBodySchema, updateCurrencyBodySchema } from "../currency/currency.schemas";
import type { QuotationService } from "../quotation/quotation.service";
import type { MemoOutService } from "../trade-document/memo-out.service";
import type { ReserveService } from "../trade-document/reserve.service";
import type { MemoOutReturnService } from "../trade-document/memo-out-return.service";
import type { MemoReceiveService } from "../trade-document/memo-receive.service";
import type { MemoReturnService } from "../trade-document/memo-return.service";
import type { MemoStockService } from "../trade-document/memo-stock.service";
import type { MemoOutstandingService } from "../trade-document/memo-outstanding.service";
import type { PurchaseOrderService } from "../purchase-order/purchase-order.service";
import { createPurchaseOrderSchema, purchaseOrderListSchema, updatePurchaseOrderSchema } from "../purchase-order/purchase-order.schemas";
import type { PurchaseService } from "../purchase/purchase.service";
import {
  createPurchaseSchema,
  purchaseListSchema,
  purchaseMemoStockSchema,
  purchaseNextNumberSchema,
  purchaseOptionsSchema,
  purchaseOrderLinesSchema,
  purchaseVersionedIdSchema,
  updatePurchaseSchema,
} from "../purchase/purchase.schemas";
import {
  memoOutstandingCustomerFiltersSchema,
  memoOutstandingCustomerItemsSchema,
  memoOutstandingCustomerListSchema,
  memoOutstandingFiltersSchema,
  memoOutstandingItemsSchema,
  memoOutstandingListSchema,
  memoOutstandingOptionsSchema,
  purchaseOutstandingListSchema,
} from "../trade-document/memo-outstanding.schemas";
import {
  createMemoOutReturnSchema,
  createMemoOutSchema,
  createReserveSchema,
  createMemoReceiveSchema,
  createMemoReturnSchema,
  memoNextNumberSchema,
  memoOutListSchema,
  memoOutOutstandingSchema,
  reserveListSchema,
  memoReceiveListSchema,
  memoReturnListSchema,
  memoStockListSchema,
  memoVersionedIdSchema,
  updateMemoOutReturnSchema,
  updateMemoOutSchema,
  updateReserveSchema,
  updateMemoReceiveSchema,
  updateMemoReturnSchema,
} from "../trade-document/memo-schemas";
import {
  createQuotationSchema,
  nextNumberSchema,
  quotationListSchema,
  reasonedIdSchema,
  updateQuotationSchema,
  versionedIdSchema,
} from "../quotation/quotation.schemas";
import { LIST_LIMIT_MAX } from "../common/partner-schemas";
import { validationException, zodFieldErrors } from "../common/errors";
import { hasMasterGrant, requireAnyMasterGrant, requireMasterGrant, requireMasterSession, type MasterAction, type MasterContext, type MasterMenu } from "./authorization";
import { canApprove, canSubmit, permittedApprovalTypes, type FlowPrincipal } from "../approval-setting/approval-flow";
import { APPROVAL_DOC_TYPE_INFO, APPROVAL_DOC_TYPES, type ApprovalDocType } from "../approval-setting/approval-types";
import { approvalPendingInputSchema, approvalSummaryInputSchema, rejectInputSchema, requestRevisionInputSchema, submitInputSchema } from "../approval/approval.schemas";
import type { ApprovalService } from "../approval/approval.service";
import type { DocumentActor } from "../trade-document/document-engine";
import { listForTypes, listForUser, markAllRead, markRead, NOTIFICATION_PAGE_MAX, unreadCount } from "../notification/notification-store";
import { NOTIFICATION_DOCUMENT_TYPES, type NotificationDocumentType } from "../notification/notification-types";

// Staged router: do not mount until the auth-owned JWT/view/license context adapter is verified.
const t = initTRPC.context<MasterContext>().create({
  errorFormatter({ shape, error }) {
    const cause = error.cause;
    const envelope = cause instanceof HttpException ? cause.getResponse() : null;
    const detail = typeof envelope === "object" && envelope !== null && "error" in envelope
      ? (envelope as { error?: { code?: unknown; fieldErrors?: unknown; details?: unknown } }).error : undefined;
    return {
      ...shape,
      data: {
        ...shape.data,
        domainCode: typeof detail?.code === "string" ? detail.code : error.code === "BAD_REQUEST" ? "VALIDATION_ERROR" : error.message,
        fieldErrors: Array.isArray(detail?.fieldErrors) ? detail.fieldErrors : undefined,
        // approval-setup api-contract: e.g. APPROVAL_SETTING_HAS_WAITING → details { pending, revision }.
        details: typeof detail?.details === "object" && detail.details !== null && !Array.isArray(detail.details) ? (detail.details as Record<string, string | number>) : undefined,
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

/** The caller's own display name for snapshots (ADR-0046 D5); context only, never input. */
function userNameOf(ctx: MasterContext): string | null {
  return ctx.principal?.displayName ?? null;
}

function permitted(menu: MasterMenu, action: MasterAction, mutation = false) {
  return t.procedure.use(({ ctx, next }) => {
    const userId = requireMasterGrant(ctx, menu, action, mutation);
    return next({ ctx: { ...ctx, userId, userName: userNameOf(ctx) } });
  });
}

/**
 * Signed in, current authorization and an eligible license; no menu grant and no CSRF (queries only).
 * Used by `decimalSetup.get` (decimal-setup SA rev 1), `approvalSetting.list` (approval-setup SA rev 1
 * authorization.md: 11 non-sensitive booleans; counts need approval-setup:VIEW) and `approval.summary` (approve-center
 * SA rev 1 D11/D15 as amended by approval-setup: the result is filtered to the types the caller `canApprove`).
 * Another use needs SA review.
 */
function signedIn() {
  return t.procedure.use(({ ctx, next }) => {
    const { userId } = requireMasterSession(ctx);
    return next({ ctx: { ...ctx, userId, userName: userNameOf(ctx) } });
  });
}

/**
 * approval-setup authorization.md: a document-type rule over the live principal (`canSubmit` = ADD or EDIT, Q-AS-25;
 * `canApprove` = today `<menu>:APPROVE`, ADR-0050 D3), with the same session / CSRF order as `requireMasterGrant`.
 */
function permittedFor(type: ApprovalDocType, allowed: (principal: FlowPrincipal, type: ApprovalDocType) => boolean) {
  return t.procedure.use(({ ctx, next }) => {
    const principal = requireMasterSession(ctx);
    if (!ctx.csrfVerified) throw new TRPCError({ code: "FORBIDDEN", message: "CSRF_INVALID" });
    if (!allowed(principal, type)) throw new TRPCError({ code: "FORBIDDEN", message: "PERMISSION_DENIED" });
    return next({ ctx: { ...ctx, userId: principal.userId, userName: userNameOf(ctx) } });
  });
}

const permissionDenied = () => new TRPCError({ code: "FORBIDDEN", message: "PERMISSION_DENIED" });

/**
 * `<doc>.get` (approval-setup authorization.md, clarification G11): `<menu>:VIEW`, or `canApprove(type)` for a document
 * in PENDING_APPROVAL (the Approve menu opens it read-only). The grant is checked before the read; an approver without
 * VIEW (`approverOnly`) gets PERMISSION_DENIED for any other status or a deleted document after the read.
 */
function viewOrApprover(type: ApprovalDocType) {
  return t.procedure.use(({ ctx, next }) => {
    const principal = requireMasterSession(ctx);
    const canView = hasMasterGrant(principal, APPROVAL_DOC_TYPE_INFO[type].menu, "VIEW");
    if (!canView && !canApprove(principal, type)) throw permissionDenied();
    return next({ ctx: { ...ctx, userId: principal.userId, userName: userNameOf(ctx), approverOnly: !canView } });
  });
}

async function readForViewer<T>(approverOnly: boolean, read: () => Promise<T>): Promise<T> {
  const detail = await read();
  const row = detail as { status?: unknown; deletedAt?: unknown };
  if (approverOnly && (row.status !== "PENDING_APPROVAL" || row.deletedAt)) throw permissionDenied();
  return detail;
}

/**
 * `approval.pending` (approval-setup authorization.md: `canApprove` replaces ADR-0046's APPROVE + VIEW). Checked on the
 * raw input before validation and before any query: no approvable type at all, or a known type the caller cannot
 * approve → PERMISSION_DENIED; an unknown type then fails validation (VALIDATION_ERROR type).
 */
function approverOfInputType() {
  return t.procedure.use(async ({ ctx, next, getRawInput }) => {
    const principal = requireMasterSession(ctx);
    const permitted = permittedApprovalTypes(principal);
    const raw = await getRawInput();
    const type = typeof raw === "object" && raw !== null ? (raw as { type?: unknown }).type : undefined;
    const known = typeof type === "string" && (APPROVAL_DOC_TYPES as readonly string[]).includes(type);
    if (permitted.length === 0 || (known && !permitted.includes(type as ApprovalDocType))) throw permissionDenied();
    return next({ ctx: { ...ctx, userId: principal.userId, userName: userNameOf(ctx) } });
  });
}

/** The acting user for snapshots (ADR-0046 D5): context only, never input. */
function actorOf(ctx: { userId: string; userName: string | null }): DocumentActor {
  return { id: ctx.userId, name: ctx.userName };
}

type ApprovalFlowService = {
  submit(actor: DocumentActor, id: string, expectedVersion: number): Promise<unknown>;
  approve(actorId: string, id: string, expectedVersion: number): Promise<unknown>;
  reject(actor: DocumentActor, id: string, expectedVersion: number, reason: string): Promise<unknown>;
  requestRevision(actor: DocumentActor, id: string, expectedVersion: number, note: string): Promise<unknown>;
};

/**
 * The approval procedures every document router shares (approval-setup api-contract, ADR-0046 as amended by ADR-0050):
 * `submit` (ADD or EDIT + CSRF; replaces ADR-0046 `resubmit`, never built), `approve` / `reject` / `requestRevision`
 * (`canApprove` + CSRF). `approve` keeps each document's existing input schema.
 */
function approvalProcedures(type: ApprovalDocType, service: ApprovalFlowService, approveInput: z.ZodType<{ id: string; expectedVersion: number }>) {
  return {
    submit: permittedFor(type, canSubmit).use(withFieldErrors(submitInputSchema)).input(submitInputSchema)
      .mutation(({ ctx, input }) => domainCall(() => service.submit(actorOf(ctx), input.id, input.expectedVersion))),
    approve: permittedFor(type, canApprove).input(approveInput).mutation(({ ctx, input }) => domainCall(() => service.approve(ctx.userId, input.id, input.expectedVersion))),
    reject: permittedFor(type, canApprove).use(withFieldErrors(rejectInputSchema)).input(rejectInputSchema)
      .mutation(({ ctx, input }) => domainCall(() => service.reject(actorOf(ctx), input.id, input.expectedVersion, input.reason))),
    requestRevision: permittedFor(type, canApprove).use(withFieldErrors(requestRevisionInputSchema)).input(requestRevisionInputSchema)
      .mutation(({ ctx, input }) => domainCall(() => service.requestRevision(actorOf(ctx), input.id, input.expectedVersion, input.note))),
  };
}

/** ADR-0049: a write to the caller's own notifications: live session plus CSRF, no menu grant. */
function signedInMutation() {
  return t.procedure.use(({ ctx, next }) => {
    const { userId } = requireMasterSession(ctx);
    if (!ctx.csrfVerified) throw new TRPCError({ code: "FORBIDDEN", message: "CSRF_INVALID" });
    return next({ ctx: { ...ctx, userId } });
  });
}

const notificationListInput = z.object({
  scope: z.enum(["for-me", "all"]),
  cursor: z.string().max(200).nullish(),
  // Sent by tRPC's useInfiniteQuery; the list only pages forward.
  direction: z.enum(["forward", "backward"]).optional(),
  limit: z.number().int().min(1).max(NOTIFICATION_PAGE_MAX).optional(),
}).strict();
const markReadInput = z.object({
  ids: z.array(z.uuid()).min(1).max(50).refine((ids) => new Set(ids).size === ids.length, "duplicate"),
}).strict();

/** The notification document types whose menu the caller may VIEW (Super Admin: all). */
export function viewableNotificationTypes(ctx: MasterContext): NotificationDocumentType[] {
  const principal = ctx.principal;
  if (!principal) return [];
  return NOTIFICATION_DOCUMENT_TYPES.filter((type) => principal.isSuperAdmin || principal.grants.includes(`${type}:VIEW`));
}

/** Read allowed with `action` on any of `menus` (currency SA-CUR-07: Quotation reads currency options). */
function permittedAny(menus: readonly MasterMenu[], action: MasterAction) {
  return t.procedure.use(({ ctx, next }) => {
    const userId = requireAnyMasterGrant(ctx, menus, action);
    return next({ ctx: { ...ctx, userId } });
  });
}

/**
 * Validates the raw input with `schema` before the procedure's own parser, so a refusal carries the contract's
 * `VALIDATION_ERROR` field errors (`{path, code}`, e.g. `to: before_from`) instead of a bare BAD_REQUEST
 * (memo-outstanding-vendor api-contract). Runs after the grant check.
 */
function withFieldErrors(schema: z.ZodType) {
  return t.middleware(async ({ next, getRawInput }) => {
    const parsed = schema.safeParse(await getRawInput());
    if (!parsed.success) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "VALIDATION_ERROR", cause: validationException(zodFieldErrors(parsed.error)) });
    }
    return next();
  });
}

export type MasterServices = Pick<{
  customer: CustomerService;
  vendor: VendorService;
  companyProfile: CompanyProfileService;
  stoneMaster: StoneMasterService;
  documentSetup: DocumentSetupService;
  decimalSetup: DecimalSetupService;
  approvalSetting: ApprovalSettingService;
  currency: CurrencyService;
  quotation: QuotationService;
  memoOut: MemoOutService;
  memoOutReturn: MemoOutReturnService;
  memoReceive: MemoReceiveService;
  memoStock: MemoStockService;
  memoReturn: MemoReturnService;
  memoOutstanding: MemoOutstandingService;
  reserve: ReserveService;
  purchaseOrder: PurchaseOrderService;
  purchase: PurchaseService;
  approval: ApprovalService;
}, "customer" | "vendor" | "companyProfile" | "stoneMaster" | "documentSetup" | "decimalSetup" | "approvalSetting" | "currency" | "quotation" | "memoOut" | "memoOutReturn" | "memoReceive" | "memoStock" | "memoReturn" | "memoOutstanding" | "reserve" | "purchaseOrder" | "purchase" | "approval">;

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
export function createMasterRouter({ customer, vendor, companyProfile, stoneMaster, documentSetup, decimalSetup, approvalSetting, currency, quotation, memoOut, memoOutReturn, memoReceive, memoStock, memoReturn, memoOutstanding, reserve, purchaseOrder, purchase, approval }: MasterServices) {
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
    // decimal-setup SA rev 1 / ADR-0040 (owner 2026-11-03): one global setting. Every signed-in, licensed user reads it
    // (every page formats numbers, Q-DEC-13); saving needs decimal-setup:EDIT + CSRF.
    decimalSetup: t.router({
      get: signedIn().query(() => domainCall(() => decimalSetup.get())),
      save: permitted("decimal-setup", "EDIT", true).use(withFieldErrors(saveDecimalSetupBodySchema)).input(saveDecimalSetupBodySchema)
        .mutation(({ ctx, input }) => domainCall(() => decimalSetup.save(ctx.userId, input))),
    }),
    // approval-setup SA rev 1 / ADR-0050 (owner 2026-11-10): per-type "require approval" switches. Every signed-in,
    // licensed user reads them (document pages choose their buttons); waiting counts need approval-setup:VIEW;
    // switching needs approval-setup:EDIT + CSRF.
    approvalSetting: t.router({
      list: signedIn().input(approvalSettingListSchema).query(({ ctx }) => domainCall(() => approvalSetting.list({
        withCounts: ctx.principal !== null && hasMasterGrant(ctx.principal, "approval-setup", "VIEW"),
      }))),
      update: permitted("approval-setup", "EDIT", true).use(withFieldErrors(approvalSettingUpdateSchema)).input(approvalSettingUpdateSchema)
        .mutation(({ ctx, input }) => domainCall(() => approvalSetting.update({ userId: ctx.userId, userName: ctx.userName }, input))),
    }),
    // approve-center SA rev 1 / ADR-0046 D14–D16 as amended by approval-setup ADR-0050: read-only Approve Center API.
    // summary: live session, filtered to the types the caller canApprove (counts only for types whose setting is ON);
    // pending: canApprove(type), type ON (else APPROVAL_TYPE_OFF). Approve / Reject / Revise stay per document router.
    approval: t.router({
      summary: signedIn().input(approvalSummaryInputSchema).query(({ ctx }) => domainCall(() => approval.summary(ctx.principal!))),
      pending: approverOfInputType().use(withFieldErrors(approvalPendingInputSchema)).input(approvalPendingInputSchema).query(({ ctx, input }) => domainCall(() => {
        if (!canApprove(ctx.principal!, input.type)) throw permissionDenied();
        return approval.pending(input);
      })),
    }),
    // currency SA rev 1 (owner 2026-10-26): currency master; rates are against the Company Profile currency.
    currency: t.router({
      list: permitted("currency", "VIEW").input(listInput).query(({ input }) => domainCall(() => currency.list({ q: input.q, cursor: input.cursor, limit: input.limit }))),
      get: permitted("currency", "VIEW").input(idInput).query(({ input }) => domainCall(() => currency.get(input.id))),
      // Read by the document pages for currency choices and rates (currency SA-CUR-07, memo out ADR-0033, memo receive ADR-0034, memo return, purchase SA-PU-15).
      options: permittedAny(["currency", "quotation", "memo-out", "memo-out-return", "memo-receive", "memo-return", "reserve", "purchase-order", "purchase"], "VIEW").query(() => domainCall(() => currency.options())),
      create: permitted("currency", "ADD", true).input(createCurrencyBodySchema).mutation(({ ctx, input }) => domainCall(() => currency.create(ctx.userId, input))),
      update: permitted("currency", "EDIT", true).input(updateCurrencyBodySchema.extend({ id: z.uuid() })).mutation(({ ctx, input }) => {
        const { id, ...body } = input;
        return domainCall(() => currency.update(ctx.userId, id, body));
      }),
      delete: permitted("currency", "DELETE", true).input(idInput).mutation(({ ctx, input }) => domainCall(() => currency.delete(ctx.userId, input.id))),
    }),
    // quotation SA rev 1 / ADR-0032 (owner 2026-10-26); joins the approval flow with approval-setup ADR-0050 (setting OFF by default).
    quotation: t.router({
      list: permitted("quotation", "VIEW").input(quotationListSchema).query(({ input }) => domainCall(() => quotation.list(input))),
      get: viewOrApprover("quotation").input(idInput).query(({ ctx, input }) => domainCall(() => readForViewer(ctx.approverOnly, () => quotation.get(input.id, ctx.principal)))),
      nextNumber: permitted("quotation", "VIEW").input(nextNumberSchema).query(({ input }) => domainCall(() => quotation.nextNumber(input.docDate))),
      options: permitted("quotation", "VIEW").input(z.object({ customerId: z.uuid().optional() }).strict())
        .query(({ input }) => domainCall(() => quotation.options(input.customerId))),
      create: permitted("quotation", "ADD", true).input(createQuotationSchema).mutation(({ ctx, input }) => domainCall(() => quotation.create(ctx.userId, input, ctx.principal))),
      update: permitted("quotation", "EDIT", true).input(updateQuotationSchema).mutation(({ ctx, input }) => {
        const { id, expectedVersion, ...body } = input;
        return domainCall(() => quotation.update(ctx.userId, id, expectedVersion, body, ctx.principal));
      }),
      ...approvalProcedures("quotation", quotation, versionedIdSchema),
      cancel: permitted("quotation", "CANCEL", true).input(reasonedIdSchema).mutation(({ ctx, input }) => domainCall(() => quotation.cancel(ctx.userId, input.id, input.expectedVersion, input.reason))),
      delete: permitted("quotation", "DELETE", true).input(versionedIdSchema).mutation(({ ctx, input }) => domainCall(() => quotation.delete(ctx.userId, input.id, input.expectedVersion))),
      // transaction-soft-delete D6/D7: restore a soft-deleted document; DELETE + CSRF (no new action).
      restore: permitted("quotation", "DELETE", true).input(versionedIdSchema).mutation(({ ctx, input }) => domainCall(() => quotation.restore(ctx.userId, input.id, input.expectedVersion))),
    }),
    // memo-out / memo-out-return SA rev 1 / ADR-0033 (owner 2026-10-28): numbers from Document Setup, drafts only.
    memoOut: t.router({
      list: permitted("memo-out", "VIEW").input(memoOutListSchema).query(({ input }) => domainCall(() => memoOut.list(input))),
      get: viewOrApprover("memo-out").input(idInput).query(({ ctx, input }) => domainCall(() => readForViewer(ctx.approverOnly, () => memoOut.get(input.id, ctx.principal)))),
      nextNumber: permitted("memo-out", "VIEW").input(memoNextNumberSchema).query(({ input }) => domainCall(() => memoOut.nextNumber(input.docDate))),
      options: permitted("memo-out", "VIEW").input(z.object({ customerId: z.uuid().optional() }).strict())
        .query(({ input }) => domainCall(() => memoOut.options(input.customerId))),
      create: permitted("memo-out", "ADD", true).input(createMemoOutSchema).mutation(({ ctx, input }) => domainCall(() => memoOut.create(ctx.userId, input, ctx.principal))),
      update: permitted("memo-out", "EDIT", true).input(updateMemoOutSchema).mutation(({ ctx, input }) => {
        const { id, expectedVersion, ...body } = input;
        return domainCall(() => memoOut.update(ctx.userId, id, expectedVersion, body, ctx.principal));
      }),
      delete: permitted("memo-out", "DELETE", true).input(memoVersionedIdSchema).mutation(({ ctx, input }) => domainCall(() => memoOut.delete(ctx.userId, input.id, input.expectedVersion))),
      // transaction-soft-delete D6/D7: restore a soft-deleted document; DELETE + CSRF (no new action).
      restore: permitted("memo-out", "DELETE", true).input(memoVersionedIdSchema).mutation(({ ctx, input }) => domainCall(() => memoOut.restore(ctx.userId, input.id, input.expectedVersion))),
      // memo-out SA rev 2 (SA-MO-14): approval cuts the stock lines into Memo Stock Reserve; APPROVE is checked on every call.
      ...approvalProcedures("memo-out", memoOut, memoVersionedIdSchema),
    }),
    // reserve SA rev 1 / ADR-0036 (owner 2026-11-02): holds stones for a later Sale; approval moves the stock lines into
    // Memo Stock Reserve (SA-RS-07). APPROVE is checked on every call.
    reserve: t.router({
      list: permitted("reserve", "VIEW").input(reserveListSchema).query(({ input }) => domainCall(() => reserve.list(input))),
      get: viewOrApprover("reserve").input(idInput).query(({ ctx, input }) => domainCall(() => readForViewer(ctx.approverOnly, () => reserve.get(input.id, ctx.principal)))),
      nextNumber: permitted("reserve", "VIEW").input(memoNextNumberSchema).query(({ input }) => domainCall(() => reserve.nextNumber(input.docDate))),
      options: permitted("reserve", "VIEW").input(z.object({ customerId: z.uuid().optional() }).strict())
        .query(({ input }) => domainCall(() => reserve.options(input.customerId))),
      create: permitted("reserve", "ADD", true).input(createReserveSchema).mutation(({ ctx, input }) => domainCall(() => reserve.create(ctx.userId, input, ctx.principal))),
      update: permitted("reserve", "EDIT", true).input(updateReserveSchema).mutation(({ ctx, input }) => {
        const { id, expectedVersion, ...body } = input;
        return domainCall(() => reserve.update(ctx.userId, id, expectedVersion, body, ctx.principal));
      }),
      delete: permitted("reserve", "DELETE", true).input(memoVersionedIdSchema).mutation(({ ctx, input }) => domainCall(() => reserve.delete(ctx.userId, input.id, input.expectedVersion))),
      // transaction-soft-delete D6/D7: restore a soft-deleted document; DELETE + CSRF (no new action).
      restore: permitted("reserve", "DELETE", true).input(memoVersionedIdSchema).mutation(({ ctx, input }) => domainCall(() => reserve.restore(ctx.userId, input.id, input.expectedVersion))),
      ...approvalProcedures("reserve", reserve, memoVersionedIdSchema),
    }),
    memoOutReturn: t.router({
      list: permitted("memo-out-return", "VIEW").input(memoOutListSchema).query(({ input }) => domainCall(() => memoOutReturn.list(input))),
      get: viewOrApprover("memo-out-return").input(idInput).query(({ ctx, input }) => domainCall(() => readForViewer(ctx.approverOnly, () => memoOutReturn.get(input.id, ctx.principal)))),
      nextNumber: permitted("memo-out-return", "VIEW").input(memoNextNumberSchema).query(({ input }) => domainCall(() => memoOutReturn.nextNumber(input.docDate))),
      options: permitted("memo-out-return", "VIEW").input(z.object({ customerId: z.uuid().optional() }).strict())
        .query(({ input }) => domainCall(() => memoOutReturn.options(input.customerId))),
      // memo-out-return SA rev 2 (SA-MOR-15): the Memo Outstanding dialog, the customer's open Memo Out From Stock lines.
      outstanding: permitted("memo-out-return", "VIEW").input(memoOutOutstandingSchema).query(({ input }) => domainCall(() => memoOutReturn.outstanding(input))),
      create: permitted("memo-out-return", "ADD", true).input(createMemoOutReturnSchema).mutation(({ ctx, input }) => domainCall(() => memoOutReturn.create(ctx.userId, input, ctx.principal))),
      update: permitted("memo-out-return", "EDIT", true).input(updateMemoOutReturnSchema).mutation(({ ctx, input }) => {
        const { id, expectedVersion, ...body } = input;
        return domainCall(() => memoOutReturn.update(ctx.userId, id, expectedVersion, body, ctx.principal));
      }),
      delete: permitted("memo-out-return", "DELETE", true).input(memoVersionedIdSchema).mutation(({ ctx, input }) => domainCall(() => memoOutReturn.delete(ctx.userId, input.id, input.expectedVersion))),
      // transaction-soft-delete D6/D7: restore a soft-deleted document; DELETE + CSRF (no new action).
      restore: permitted("memo-out-return", "DELETE", true).input(memoVersionedIdSchema).mutation(({ ctx, input }) => domainCall(() => memoOutReturn.restore(ctx.userId, input.id, input.expectedVersion))),
      // SA-MOR-17: approval adds to the Memo Out lines' returned and moves Memo Stock Reserve back to pending.
      ...approvalProcedures("memo-out-return", memoOutReturn, memoVersionedIdSchema),
    }),
    // memo-receive SA rev 1 / ADR-0034 (owner 2026-10-29): PENDING_APPROVAL → APPROVED; approval fills Memo Stock.
    memoReceive: t.router({
      list: permitted("memo-receive", "VIEW").input(memoReceiveListSchema).query(({ input }) => domainCall(() => memoReceive.list(input))),
      get: viewOrApprover("memo-receive").input(idInput).query(({ ctx, input }) => domainCall(() => readForViewer(ctx.approverOnly, () => memoReceive.get(input.id, ctx.principal)))),
      nextNumber: permitted("memo-receive", "VIEW").input(memoNextNumberSchema).query(({ input }) => domainCall(() => memoReceive.nextNumber(input.docDate))),
      options: permitted("memo-receive", "VIEW").input(z.object({ vendorId: z.uuid().optional() }).strict())
        .query(({ input }) => domainCall(() => memoReceive.options(input.vendorId))),
      create: permitted("memo-receive", "ADD", true).input(createMemoReceiveSchema).mutation(({ ctx, input }) => domainCall(() => memoReceive.create(ctx.userId, input, ctx.principal))),
      update: permitted("memo-receive", "EDIT", true).input(updateMemoReceiveSchema).mutation(({ ctx, input }) => {
        const { id, expectedVersion, ...body } = input;
        return domainCall(() => memoReceive.update(ctx.userId, id, expectedVersion, body, ctx.principal));
      }),
      delete: permitted("memo-receive", "DELETE", true).input(memoVersionedIdSchema).mutation(({ ctx, input }) => domainCall(() => memoReceive.delete(ctx.userId, input.id, input.expectedVersion))),
      // transaction-soft-delete D6/D7: restore a soft-deleted document; DELETE + CSRF (no new action).
      restore: permitted("memo-receive", "DELETE", true).input(memoVersionedIdSchema).mutation(({ ctx, input }) => domainCall(() => memoReceive.restore(ctx.userId, input.id, input.expectedVersion))),
      // The creator may approve (like quotation Q-QT-02); the server checks APPROVE on every call.
      ...approvalProcedures("memo-receive", memoReceive, memoVersionedIdSchema),
    }),
    // Memo Stock list (SA-MR-11): Memo Return "Add Memo Stock" (its vendor) and Memo Out "From Stock" (every vendor, SA-MO-15).
    memoStock: t.router({
      list: permittedAny(["memo-return", "memo-receive", "memo-out", "reserve", "quotation"], "VIEW").input(memoStockListSchema).query(({ input }) => domainCall(() => memoStock.list(input))),
    }),
    // memo-return SA rev 2 (owner 2026-10-29): Memo Stock items back to their vendor; approval reduces pending (Q-MR-15).
    memoReturn: t.router({
      list: permitted("memo-return", "VIEW").input(memoReturnListSchema).query(({ input }) => domainCall(() => memoReturn.list(input))),
      get: viewOrApprover("memo-return").input(idInput).query(({ ctx, input }) => domainCall(() => readForViewer(ctx.approverOnly, () => memoReturn.get(input.id, ctx.principal)))),
      nextNumber: permitted("memo-return", "VIEW").input(memoNextNumberSchema).query(({ input }) => domainCall(() => memoReturn.nextNumber(input.docDate))),
      options: permitted("memo-return", "VIEW").input(z.object({ vendorId: z.uuid().optional() }).strict())
        .query(({ input }) => domainCall(() => memoReturn.options(input.vendorId))),
      create: permitted("memo-return", "ADD", true).input(createMemoReturnSchema).mutation(({ ctx, input }) => domainCall(() => memoReturn.create(ctx.userId, input, ctx.principal))),
      update: permitted("memo-return", "EDIT", true).input(updateMemoReturnSchema).mutation(({ ctx, input }) => {
        const { id, expectedVersion, ...body } = input;
        return domainCall(() => memoReturn.update(ctx.userId, id, expectedVersion, body, ctx.principal));
      }),
      delete: permitted("memo-return", "DELETE", true).input(memoVersionedIdSchema).mutation(({ ctx, input }) => domainCall(() => memoReturn.delete(ctx.userId, input.id, input.expectedVersion))),
      // transaction-soft-delete D6/D7: restore a soft-deleted document; DELETE + CSRF (no new action).
      restore: permitted("memo-return", "DELETE", true).input(memoVersionedIdSchema).mutation(({ ctx, input }) => domainCall(() => memoReturn.restore(ctx.userId, input.id, input.expectedVersion))),
      ...approvalProcedures("memo-return", memoReturn, memoVersionedIdSchema),
    }),
    // purchase-order SA rev 1 / ADR-0041 (owner 2026-11-04): keyed-in vendor document; Approve on the page sends its
    // lines to Purchase (no stock written). The creator may approve; the server checks APPROVE on every call.
    purchaseOrder: t.router({
      list: permitted("purchase-order", "VIEW").input(purchaseOrderListSchema).query(({ input }) => domainCall(() => purchaseOrder.list(input))),
      get: viewOrApprover("purchase-order").input(idInput).query(({ ctx, input }) => domainCall(() => readForViewer(ctx.approverOnly, () => purchaseOrder.get(input.id, ctx.principal)))),
      nextNumber: permitted("purchase-order", "VIEW").input(memoNextNumberSchema).query(({ input }) => domainCall(() => purchaseOrder.nextNumber(input.docDate))),
      options: permitted("purchase-order", "VIEW").input(z.object({ vendorId: z.uuid().optional() }).strict())
        .query(({ input }) => domainCall(() => purchaseOrder.options(input.vendorId))),
      create: permitted("purchase-order", "ADD", true).input(createPurchaseOrderSchema).mutation(({ ctx, input }) => domainCall(() => purchaseOrder.create(ctx.userId, input, ctx.principal))),
      update: permitted("purchase-order", "EDIT", true).input(updatePurchaseOrderSchema).mutation(({ ctx, input }) => {
        const { id, expectedVersion, ...body } = input;
        return domainCall(() => purchaseOrder.update(ctx.userId, id, expectedVersion, body, ctx.principal));
      }),
      delete: permitted("purchase-order", "DELETE", true).input(memoVersionedIdSchema).mutation(({ ctx, input }) => domainCall(() => purchaseOrder.delete(ctx.userId, input.id, input.expectedVersion))),
      // transaction-soft-delete D6/D7: restore a soft-deleted document; DELETE + CSRF (no new action).
      restore: permitted("purchase-order", "DELETE", true).input(memoVersionedIdSchema).mutation(({ ctx, input }) => domainCall(() => purchaseOrder.restore(ctx.userId, input.id, input.expectedVersion))),
      ...approvalProcedures("purchase-order", purchaseOrder, memoVersionedIdSchema),
    }),
    // purchase SA rev 1 / ADR-0042 (owner 2026-11-04): Memo Stock / PO / manual lines; Save checks, Approve cuts the stock
    // (SA default D2). Grants per authorization.md; input is validated after the grant with contract field errors.
    purchase: t.router({
      list: permitted("purchase", "VIEW").use(withFieldErrors(purchaseListSchema)).input(purchaseListSchema).query(({ input }) => domainCall(() => purchase.list(input))),
      get: viewOrApprover("purchase").input(idInput).query(({ ctx, input }) => domainCall(() => readForViewer(ctx.approverOnly, () => purchase.get(input.id, ctx.principal)))),
      nextNumber: permitted("purchase", "VIEW").input(purchaseNextNumberSchema).query(({ input }) => domainCall(() => purchase.nextNumber(input.docDate))),
      options: permitted("purchase", "VIEW").input(purchaseOptionsSchema).query(({ input }) => domainCall(() => purchase.options(input.vendorId))),
      // SA-PU-12/13 pickers (D9: purchase:VIEW alone; memoStock.list is not opened to purchase).
      memoStock: permitted("purchase", "VIEW").use(withFieldErrors(purchaseMemoStockSchema)).input(purchaseMemoStockSchema).query(({ input }) => domainCall(() => purchase.memoStock(input))),
      purchaseOrderLines: permitted("purchase", "VIEW").use(withFieldErrors(purchaseOrderLinesSchema)).input(purchaseOrderLinesSchema)
        .query(({ input }) => domainCall(() => purchase.purchaseOrderLines(input))),
      create: permitted("purchase", "ADD", true).use(withFieldErrors(createPurchaseSchema)).input(createPurchaseSchema).mutation(({ ctx, input }) => domainCall(() => purchase.create(ctx.userId, input, ctx.principal))),
      update: permitted("purchase", "EDIT", true).use(withFieldErrors(updatePurchaseSchema)).input(updatePurchaseSchema).mutation(({ ctx, input }) => {
        const { id, expectedVersion, ...body } = input;
        return domainCall(() => purchase.update(ctx.userId, id, expectedVersion, body, ctx.principal));
      }),
      delete: permitted("purchase", "DELETE", true).input(purchaseVersionedIdSchema).mutation(({ ctx, input }) => domainCall(() => purchase.delete(ctx.userId, input.id, input.expectedVersion))),
      // transaction-soft-delete D6/D7: restore a soft-deleted document; DELETE + CSRF (no new action).
      restore: permitted("purchase", "DELETE", true).use(withFieldErrors(purchaseVersionedIdSchema)).input(purchaseVersionedIdSchema).mutation(({ ctx, input }) => domainCall(() => purchase.restore(ctx.userId, input.id, input.expectedVersion))),
      // SA-PU-09: the stock cut; the creator may approve; APPROVE + CSRF on every call.
      ...approvalProcedures("purchase", purchase, purchaseVersionedIdSchema),
    }),
    // Memo Outstanding From Vendor report (memo-outstanding-vendor SA-MOV-01/10): read-only, VIEW on its own menu.
    // Purchase Outstanding (purchase-outstanding SA-POS-05, ADR-0044): read-only, VIEW on its own menu.
    purchaseOutstanding: t.router({
      summary: permitted("purchase-outstanding", "VIEW").use(withFieldErrors(memoOutstandingFiltersSchema)).input(memoOutstandingFiltersSchema)
        .query(({ input }) => domainCall(() => memoOutstanding.purchaseSummary(input))),
      list: permitted("purchase-outstanding", "VIEW").use(withFieldErrors(purchaseOutstandingListSchema)).input(purchaseOutstandingListSchema)
        .query(({ input }) => domainCall(() => memoOutstanding.purchaseList(input))),
      items: permitted("purchase-outstanding", "VIEW").use(withFieldErrors(memoOutstandingItemsSchema)).input(memoOutstandingItemsSchema)
        .query(({ input }) => domainCall(() => memoOutstanding.purchaseItems(input))),
      options: permitted("purchase-outstanding", "VIEW").use(withFieldErrors(memoOutstandingOptionsSchema)).input(memoOutstandingOptionsSchema)
        .query(() => domainCall(() => memoOutstanding.purchaseOptions())),
    }),
    memoOutstanding: t.router({
      vendorSummary: permitted("memo-outstanding-vendor", "VIEW").use(withFieldErrors(memoOutstandingFiltersSchema)).input(memoOutstandingFiltersSchema)
        .query(({ input }) => domainCall(() => memoOutstanding.vendorSummary(input))),
      vendorList: permitted("memo-outstanding-vendor", "VIEW").use(withFieldErrors(memoOutstandingListSchema)).input(memoOutstandingListSchema)
        .query(({ input }) => domainCall(() => memoOutstanding.vendorList(input))),
      vendorItems: permitted("memo-outstanding-vendor", "VIEW").use(withFieldErrors(memoOutstandingItemsSchema)).input(memoOutstandingItemsSchema)
        .query(({ input }) => domainCall(() => memoOutstanding.vendorItems(input))),
      vendorOptions: permitted("memo-outstanding-vendor", "VIEW").use(withFieldErrors(memoOutstandingOptionsSchema)).input(memoOutstandingOptionsSchema)
        .query(() => domainCall(() => memoOutstanding.vendorOptions())),
      // Memo Outstanding From Customer report (memo-outstanding-customer SA-MOC-01/09): read-only, VIEW on its own menu.
      customerSummary: permitted("memo-outstanding-customer", "VIEW").use(withFieldErrors(memoOutstandingCustomerFiltersSchema)).input(memoOutstandingCustomerFiltersSchema)
        .query(({ input }) => domainCall(() => memoOutstanding.customerSummary(input))),
      customerList: permitted("memo-outstanding-customer", "VIEW").use(withFieldErrors(memoOutstandingCustomerListSchema)).input(memoOutstandingCustomerListSchema)
        .query(({ input }) => domainCall(() => memoOutstanding.customerList(input))),
      customerItems: permitted("memo-outstanding-customer", "VIEW").use(withFieldErrors(memoOutstandingCustomerItemsSchema)).input(memoOutstandingCustomerItemsSchema)
        .query(({ input }) => domainCall(() => memoOutstanding.customerItems(input))),
      customerOptions: permitted("memo-outstanding-customer", "VIEW").use(withFieldErrors(memoOutstandingOptionsSchema)).input(memoOutstandingOptionsSchema)
        .query(() => domainCall(() => memoOutstanding.customerOptions())),
    }),
    // ADR-0049: one's own notifications need a live session, no menu grant; "all" shows only types the caller may VIEW.
    notification: t.router({
      unreadCount: signedIn().query(({ ctx }) => domainCall(() => unreadCount(ctx.userId))),
      list: signedIn().input(notificationListInput).query(({ ctx, input }) => domainCall(() => (
        input.scope === "for-me"
          ? listForUser(ctx.userId, input.cursor, input.limit)
          : listForTypes(viewableNotificationTypes(ctx), input.cursor, input.limit)
      ))),
      markRead: signedInMutation().input(markReadInput).mutation(({ ctx, input }) => domainCall(() => markRead(ctx.userId, input.ids))),
      markAllRead: signedInMutation().mutation(({ ctx }) => domainCall(() => markAllRead(ctx.userId))),
    }),
  });
}

export type MasterRouter = ReturnType<typeof createMasterRouter>;
