import { uuidV7 } from "@gms/storage";
import { Logger } from "@nestjs/common";
import { z } from "zod";
import { validationException, type FieldError } from "../common/errors";
import { WRITE_TX, type Tx } from "../common/persistence";
import { isCurrencyAllowed } from "../currency/currency-directory";
import { prisma } from "../database/prisma-client";
import { DOC_NO_MAX, formatDocNo, nextPlainRunningNo, nextRunningNo, numberingInEffect, type NumberedDocument } from "../document-setup/document-numbering";
import { fromDbDate, toDbDate } from "../document-setup/document-setup.service";
import type { DocumentTransactionKey } from "../document-setup/document-setup.transactions";
import type { Prisma } from "../generated/prisma/client";
import { calculateTotals, oversizeAmounts } from "../quotation/quotation.calculate";
import { CHARGE_TYPES, type LineInput } from "../quotation/quotation.schemas";
import { assertEditable, flowFlags, isEditableStatus, REVISE_LIMIT, saveStatus, type FlowPrincipal, type SavePlan } from "../approval-setting/approval-flow";
import { peekApprovalSetting, readApprovalSetting } from "../approval-setting/approval-setting.service";
import type { ApprovalDocType } from "../approval-setting/approval-types";
import type { DocumentErrors } from "./document-errors";
import { lineTotals } from "./document-totals";
import { emitNotificationSignals } from "../notification/notification-hub";
import { approverRecipients, creatorRecipient } from "../notification/notification-recipients";
import { recordNotification } from "../notification/notification-store";
import { isNotificationDocumentType, type NotificationDocumentType, type NotificationSignal } from "../notification/notification-types";

/**
 * Shared document engine for reserve, memo out, memo out return (ADR-0033/0036), memo receive (ADR-0034), memo return,
 * purchase order (ADR-0041) and purchase (ADR-0042): the quotation rules — Document Setup number (max + 1 under the
 * numbering-row lock, plain 1, 2, 3 … without a row), party + address snapshots, server totals with the quotation
 * calculator, optimistic version. The party part (customer or vendor) comes from an adapter. An optional line hook adds
 * per-line columns (memo receive: kept line ids, Stock IDs and line photos, SA-MR-17; memo return: the Memo Stock item).
 *
 * Approval flow (approval-setup SA rev 1 / ADR-0050, amending approve-center ADR-0046), shared by the seven documents:
 * - every create / update / submit / restore reads the type's setting `FOR SHARE` first (lock order: setting → header →
 *   source header(s) `FOR SHARE` → memo_out_line rows → memo_stock rows → purchase_order_line rows; a dependent document
 *   locks its source headers before inserting lines or locking stock, INV-20261111-002 F1);
 * - ON: Save → DRAFT; `submit` → PENDING_APPROVAL (locked); `approve` → APPROVED with the document's effects;
 *   `requestRevision` (once, reason) → REVISION_REQUESTED; `reject` (reason) → REJECTED (final);
 * - OFF: Save → APPROVED with `auto_approved` and the effects in the same transaction (an effect failure refuses the
 *   whole Save with the Approve error); an auto-approved document stays editable / deletable until used: edit reverses
 *   the old effects and applies the new ones, delete reverses them.
 * The effects (`apply` = today's approve body, `reverse` = its exact inverse, `usedBy`) come per document type.
 */

const COMPANY_PROFILE_ID = 1;
const PENDING = "PENDING_APPROVAL";
/** Statuses that can pass the header lock of update / delete; `assertEditable` then decides (auto-approved, used). */
const CHANGEABLE = ["DRAFT", "REVISION_REQUESTED", "APPROVED"] as const;
const SUBMITTABLE = ["DRAFT", "REVISION_REQUESTED"] as const;
const NO_GRANTS: FlowPrincipal = { isSuperAdmin: false, grants: [] };

type Row = Record<string, unknown>;
type Dec = Prisma.Decimal;
type DocDelegate = {
  findMany(args: unknown): Promise<Row[]>;
  findUnique(args: unknown): Promise<Row | null>;
  count(args: unknown): Promise<number>;
  create(args: unknown): Promise<unknown>;
  updateMany(args: unknown): Promise<{ count: number }>;
  update(args: unknown): Promise<unknown>;
};

/** The columns a guarded write reads to explain a miss (transaction-soft-delete D8; revise limit ADR-0050). */
export const MISS_SELECT = { status: true, version: true, deletedAt: true, revisionCount: true } as const;
export type MissRow = { status: string; version: number; deletedAt: Date | null; revisionCount?: number } | null;

/**
 * A guarded write (update / approve / delete) changed no row; throws the first match of D8:
 * missing → NOT_FOUND, soft-deleted → `<CODE>_DELETED`, status outside `allowed` → STATUS_INVALID, else CHANGED.
 */
export function explainMiss(errors: Pick<DocumentErrors, "notFound" | "deleted" | "statusInvalid" | "changed">, row: MissRow, allowed: readonly string[]): never {
  if (!row) throw errors.notFound();
  if (row.deletedAt) throw errors.deleted();
  if (!allowed.includes(row.status)) throw errors.statusInvalid();
  throw errors.changed();
}

/** Restore changed no row (D8): missing → NOT_FOUND, not deleted → STATUS_INVALID, else (stale version) CHANGED. */
export function explainRestoreMiss(errors: Pick<DocumentErrors, "notFound" | "statusInvalid" | "changed">, row: MissRow): never {
  if (!row) throw errors.notFound();
  if (!row.deletedAt) throw errors.statusInvalid();
  throw errors.changed();
}

/** Review miss (D8 order + ADR-0050 revise limit): NOT_FOUND → DELETED → STATUS_INVALID → REVISE_LIMIT → CHANGED. */
export function explainReviewMiss(errors: Pick<DocumentErrors, "notFound" | "deleted" | "statusInvalid" | "changed" | "reviseLimit">, row: MissRow, action: "REJECT" | "REVISE"): never {
  if (!row) throw errors.notFound();
  if (row.deletedAt) throw errors.deleted();
  if (row.status !== PENDING) throw errors.statusInvalid();
  if (action === "REVISE" && (row.revisionCount ?? 0) >= REVISE_LIMIT) throw errors.reviseLimit();
  throw errors.changed();
}

type ChildDelegate = { createMany(args: unknown): Promise<unknown>; deleteMany(args: unknown): Promise<unknown> };
type Client = Tx | typeof prisma;

/** The acting user (context only, never input); `name` is the display-name snapshot (ADR-0046 D5). */
export type DocumentActor = { id: string; name: string | null };

/** The stored document an effect works on. */
export type EffectDoc = { id: string; docNo: string };

/**
 * A document type's stock effects (approval-setup architecture "Effects and their reversal"). `apply` is today's
 * `approve()` body after the status change: it reads the stored lines and moves stock under row locks, throwing the
 * type's approve error (e.g. `<CODE>_PENDING_SHORT`) when short; `result` joins the approve output, `log` its log line.
 * `reverse` is its exact inverse through the same helpers and lock order; a reversal a later document has made
 * impossible throws `<CODE>_IN_USE`. `usedBy` = the number of the first document that uses this one, or null.
 */
export type DocumentEffects = {
  apply(tx: Tx, doc: EffectDoc, actorId: string, now: Date): Promise<{ result: Row; log: Row }>;
  reverse(tx: Tx, doc: EffectDoc, now: Date): Promise<void>;
  usedBy(client: Client, id: string): Promise<string | null>;
};

/** A document type without stock effects (Purchase Order lines wait for Purchase; Quotation). */
export const NO_EFFECTS: DocumentEffects = {
  apply: async () => ({ result: {}, log: {} }),
  reverse: async () => undefined,
  usedBy: async () => null,
};

/** A line of any trade document; memo receive lines have no stone code id and no location (SA-MR-07). */
export type EngineLine = Omit<LineInput, "stoneCodeId" | "location"> & { stoneCodeId?: string | null; location?: string };

/** The shared input fields (quotation `tradeDocumentFields`) every adapter's input carries. */
export type TradeDocumentInput = {
  docDate: string;
  dueDate: string;
  currency: string;
  exchangeRate: string | null;
  ref: string;
  documentNote: string;
  lines: EngineLine[];
  discount: { type: "NONE" | "PERCENT" | "AMOUNT"; value: string };
  tax: { enabled: boolean; rate: string; includeInPrice: boolean };
  serviceCharges: { type: (typeof CHARGE_TYPES)[number]; amount: string }[];
  labor: { work: string; basis: "PCS" | "WEIGHT"; qty: string; rate: string } | null;
};

/** Customer (memo out) or vendor (memo out return) handling. */
export type PartyAdapter<Input extends TradeDocumentInput, Out extends Row = Row> = {
  /** Columns read from a stored document so an inactive stored choice may stay. */
  storedSelect: Record<string, true>;
  /** Checks the party and its address(es); returns the header columns (ids + snapshots) or field errors. */
  check(tx: Tx, input: Input, stored: Row | null): Promise<{ columns: Row; errors: FieldError[] }>;
  /** Party fields of the detail output. */
  output(row: Row): Out;
  /** Snapshot column with the party name (list search and list item). */
  nameColumn: string;
  /** Output key of the party name in a list item, e.g. `customerName`. */
  listNameKey: string;
  /** Column filtered by the list's party id. */
  partyColumn: string;
};

export type EngineConfig<Input extends TradeDocumentInput, Out extends Row = Row> = {
  document: NumberedDocument;
  transactionKey: DocumentTransactionKey;
  event: string;
  model: string;
  lineModel: string;
  chargeModel: string;
  parentKey: string;
  errors: DocumentErrors;
  party: PartyAdapter<Input, Out>;
  /** Approval setting key and permission menu (approval-setup registry). */
  approvalType: ApprovalDocType;
  /** Stock effects of approval (default none). */
  effects?: DocumentEffects;
  /** Lines keep an Outstanding quantity (memo out return UI rev 3); pcs / weightCt are then the Return quantity. */
  outstanding?: boolean;
  /**
   * Runs in the write transaction after the status checks (and, for an auto-approved edit, after the old effects were
   * reversed); returns the input to store, e.g. memo return lines completed from their Memo Stock items. `submit` runs
   * it on the stored content as the save validation (create: documentId null).
   */
  prepare?: (tx: Tx, input: Input, documentId: string | null) => Promise<Input>;
  /**
   * A dependent document (Memo Out Return, Purchase) locks the source headers its input names `FOR SHARE`
   * (`lockSourceHeaders`) before `prepare`, line writes and the old effects' reversal whenever the Save applies effects,
   * so a concurrent soft delete / edit of the source serializes with it (INV-20261111-002 F1). `apply` re-locks and
   * re-checks them (approve, restore, go-live).
   */
  lockSources?: (tx: Tx, input: Input) => Promise<void>;
  /** Line columns the line table does not have (memo receive: `stoneCodeId`, `location`). */
  lineOmit?: readonly ("stoneCodeId" | "location")[];
  /** Per-line columns assigned inside the save transaction (memo receive Stock IDs). */
  lineHook?: LineHook<Input>;
  /** Extra header fields of the detail output (memo receive approval). */
  detailExtra?: (row: Row) => Row;
};

/** Called inside the save transaction after the document number is issued (lock order: number → hook → document). */
export type LineHook<Input extends TradeDocumentInput> = {
  /** Stored line columns read on update (passed to `assign`). */
  storedSelect: Record<string, true>;
  /** Columns for each input line, in order; may set `id` to keep a saved line's id. `stored` is null on create. */
  assign(tx: Tx, input: Input, stored: Row[] | null): Promise<Row[]>;
  /** Final detail output of a line from its row and the default output. */
  output(line: Row, base: Row): Row;
  /** Extra fields of the create / update result. */
  result(assigned: Row[]): Row;
  /** Relations read with each line by `get` (memo receive: photos in order). */
  lineInclude?: Record<string, unknown>;
  /** Writes per-line child rows after the lines (same transaction); `lineIds` are in input order. */
  afterLines?(tx: Tx, input: Input, lineIds: string[]): Promise<void>;
};

/** A line input of a document with `outstanding` lines. */
type OutstandingLine = LineInput & { outstandingPcs: number; outstandingWeightCt: string };

export const documentListFields = {
  q: z.string().trim().max(100).optional(),
  partyId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  cursor: z.string().max(200).nullish(),
  /** Sent by tRPC useInfiniteQuery (Load more); ignored, as in the other paged lists. */
  direction: z.enum(["forward", "backward"]).optional(),
  limit: z.number().int().min(1).max(50).default(50),
  /** transaction-soft-delete D9: false (default) = not deleted, as before; true = deleted documents only. */
  deleted: z.boolean().default(false),
};
export const documentListSchema = z.object(documentListFields).strict();
/** `status` is accepted by the documents with an approval flow (all seven). */
export type DocumentListInput = z.output<typeof documentListSchema> & { status?: string };

const cursorSchema = z.object({ d: z.iso.date(), c: z.iso.datetime(), i: z.uuid(), v: z.literal(1) }).strict();

const money = (value: unknown) => (value as Dec).toFixed(2);
const isoOrNull = (value: unknown) => (value instanceof Date ? value.toISOString() : null);
const text = (value: unknown) => (value === null || value === undefined ? null : (value as Dec).toString());

export class TradeDocumentEngine<Input extends TradeDocumentInput, Out extends Row = Row, Status extends string = "DRAFT"> {
  private readonly logger: Logger;
  private readonly effects: DocumentEffects;

  constructor(private readonly config: EngineConfig<Input, Out>) {
    this.logger = new Logger(config.event);
    this.effects = config.effects ?? NO_EFFECTS;
  }

  private doc(client: Client): DocDelegate {
    return (client as unknown as Record<string, DocDelegate>)[this.config.model];
  }

  /** ADR-0049: the documents with an approval step notify; their Document Setup key is also their menu leaf. */
  private get notificationType(): NotificationDocumentType | null {
    return isNotificationDocumentType(this.config.transactionKey) ? this.config.transactionKey : null;
  }

  /** Display-only summary of a document (party, grand total, currency) for its notification. */
  private async notificationSummary(tx: Tx, id: string) {
    const row = await this.doc(tx).findUnique({ where: { id }, select: { [this.config.party.nameColumn]: true, grandTotal: true, currencyCode: true } });
    if (!row) return {};
    return { partyName: row[this.config.party.nameColumn] as string, amount: row.grandTotal == null ? undefined : money(row.grandTotal), currency: row.currencyCode as string };
  }

  /**
   * ADR-0049 D3/D4: inside an approve transaction, records "document.approved" for the document's creator. Returns the
   * signals to emit after commit (`emitNotificationSignals`).
   */
  async notifyApproved(tx: Tx, id: string, actorId: string): Promise<NotificationSignal[]> {
    const documentType = this.notificationType;
    if (!documentType) return [];
    const row = await this.doc(tx).findUnique({ where: { id }, select: { docNo: true, createdBy: true } });
    if (!row) return [];
    const signal = await recordNotification(tx, {
      type: "document.approved",
      documentType,
      documentId: id,
      docNo: row.docNo as string,
      actorId,
      recipients: creatorRecipient(row.createdBy as string | null, actorId),
      summary: await this.notificationSummary(tx, id),
    });
    return [signal];
  }

  private child(client: Client, model: string): ChildDelegate {
    return (client as unknown as Record<string, ChildDelegate>)[model];
  }

  async list(input: DocumentListInput) {
    const { party, errors } = this.config;
    const where: Row = {
      deletedAt: input.deleted ? { not: null } : null,
      ...(input.partyId ? { [party.partyColumn]: input.partyId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.from || input.to ? { docDate: { ...(input.from ? { gte: toDbDate(input.from) } : {}), ...(input.to ? { lte: toDbDate(input.to) } : {}) } } : {}),
    };
    const and: Row[] = [];
    if (input.q) {
      const contains = { contains: input.q, mode: "insensitive" as const };
      and.push({ OR: [{ docNo: contains }, { [party.nameColumn]: contains }, { ref: contains }] });
    }
    if (input.cursor) {
      const after = decodeCursor(input.cursor);
      const docDate = toDbDate(after.docDate);
      const createdAt = new Date(after.createdAt);
      and.push({ OR: [{ docDate: { lt: docDate } }, { docDate, createdAt: { lt: createdAt } }, { docDate, createdAt, id: { lt: after.id } }] });
    }
    try {
      const [rows, total] = await Promise.all([
        this.doc(prisma).findMany({
          where: { ...where, AND: and },
          orderBy: [{ docDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
          take: input.limit + 1,
          select: {
            id: true, docNo: true, status: true, docDate: true, dueDate: true, [party.nameColumn]: true, currencyCode: true, grandTotal: true, createdAt: true, updatedAt: true, deletedAt: true,
            autoApproved: true, revisionCount: true, reviewAction: true, reviewNote: true, reviewedAt: true, reviewedByName: true,
          },
        }),
        this.doc(prisma).count({ where }),
      ]);
      const page = rows.slice(0, input.limit);
      const last = page.at(-1);
      return {
        items: page.map((row) => ({
          id: row.id as string,
          docNo: row.docNo as string,
          status: row.status as Status,
          docDate: fromDbDate(row.docDate as Date),
          dueDate: fromDbDate(row.dueDate as Date),
          [party.listNameKey]: row[party.nameColumn] as string,
          currency: row.currencyCode as string,
          grandTotal: money(row.grandTotal),
          updatedAt: (row.updatedAt as Date).toISOString(),
          deletedAt: isoOrNull(row.deletedAt),
          // ADR-0050 D6 Daybook: latest status, auto-approved and the latest Revise / Reject reason.
          autoApproved: row.autoApproved as boolean,
          revisionCount: revisionCountOf(row),
          review: reviewOfRow(row),
        })),
        nextCursor: rows.length > input.limit && last
          ? encodeCursor(fromDbDate(last.docDate as Date), (last.createdAt as Date).toISOString(), last.id as string)
          : null,
        total,
      };
    } catch (error) {
      throw errors.map(error, "list");
    }
  }

  /** Detail plus `Flow` for `viewer` (its EDIT / DELETE / ADD grants decide the flags; no viewer = no grants). */
  async get(id: string, viewer: FlowPrincipal | null = null) {
    const { errors } = this.config;
    try {
      const lineInclude = this.config.lineHook?.lineInclude;
      const row = await this.doc(prisma).findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" }, ...(lineInclude ? { include: lineInclude } : {}) }, charges: true } });
      if (!row) throw errors.notFound();
      const [requireApproval, usedBy] = await Promise.all([
        peekApprovalSetting(prisma, this.config.approvalType),
        isAutoApproved(row) && !row.deletedAt ? this.effects.usedBy(prisma, id) : Promise.resolve(null),
      ]);
      return { ...this.toDetail(row), ...documentFlow(row, this.config.approvalType, requireApproval, usedBy, viewer) };
    } catch (error) {
      throw errors.map(error, "get");
    }
  }

  /** Preview of the number the next save would get; the saved number may be higher. */
  async nextNumber(docDate: string) {
    try {
      return { docNo: (await this.issueNumber(prisma, docDate, false)).docNo };
    } catch (error) {
      throw this.config.errors.map(error, "nextNumber");
    }
  }

  /**
   * Save (create): ON → DRAFT; OFF → APPROVED with `auto_approved` and the effects in the same transaction (an effect
   * failure refuses the whole Save with the Approve error, nothing written).
   */
  async create(actorId: string, rawInput: Input, viewer: FlowPrincipal | null = null) {
    const { errors, event, lineHook } = this.config;
    try {
      const saved = await prisma.$transaction(async (tx) => {
        const requireApproval = await readApprovalSetting(tx, this.config.approvalType);
        const plan = saveStatus(requireApproval, null);
        if (plan.effects !== "none") await this.config.lockSources?.(tx, rawInput);
        const input = this.config.prepare ? await this.config.prepare(tx, rawInput, null) : rawInput;
        const partyColumns = await this.checkReferences(tx, input, null);
        const { numberingId, runningNo, docNo } = await this.issueNumber(tx, input.docDate, true);
        if (docNo.length > DOC_NO_MAX) throw validationException([{ path: "docNo", code: "too_big" }]);
        const header = this.headerData(input);
        const assigned = lineHook ? await lineHook.assign(tx, input, null) : null;
        const id = uuidV7();
        const now = new Date();
        // ADR-0050: a DRAFT is not submitted (submitted_* stay null until `submit`).
        await this.doc(tx).create({
          data: {
            id, numberingId, runningNo, docNo, ...header, ...lineTotals(input.lines), ...partyColumns, ...planData(plan, false, actorId, now),
            createdAt: now, createdBy: actorId, updatedAt: now, updatedBy: actorId,
          },
        });
        await this.writeChildren(tx, id, input, assigned);
        const applied = plan.effects === "none" ? null : await this.effects.apply(tx, { id, docNo }, actorId, now);
        return {
          created: { id, docNo, version: 1, ...(assigned && lineHook ? lineHook.result(assigned) : {}), ...saveFlow(this.config.approvalType, plan, 0, requireApproval, viewer) },
          applied,
        };
      }, WRITE_TX);
      const { created, applied } = saved;
      this.logger.log({ event: `${event}.created`, actorId, id: created.id, docNo: created.docNo, status: created.status, ...applied?.log });
      return created;
    } catch (error) {
      throw errors.map(error, "create");
    }
  }

  /**
   * Save (update), allowed while DRAFT, REVISION_REQUESTED or auto-approved and not used (ADR-0050 rule 2). The header
   * is locked first by a guarded version bump (D8 miss order). DRAFT stays DRAFT (ON) or becomes APPROVED auto + effects
   * (OFF); REVISION_REQUESTED stays; an auto-approved document reverses its old effects before the new content is
   * validated and written, then applies the new effects — all in one transaction.
   */
  async update(actorId: string, id: string, expectedVersion: number, rawInput: Input, viewer: FlowPrincipal | null = null) {
    const { errors, event, party, lineModel, chargeModel, parentKey, lineHook } = this.config;
    const storedLineSelect = { ...(this.config.lineOmit?.includes("stoneCodeId") ? {} : { stoneCodeId: true }), ...lineHook?.storedSelect };
    try {
      const saved = await prisma.$transaction(async (tx) => {
        const requireApproval = await readApprovalSetting(tx, this.config.approvalType);
        const now = new Date();
        await this.lockHeader(tx, id, expectedVersion, CHANGEABLE, actorId, now);
        const stored = (await this.doc(tx).findUnique({
          where: { id },
          select: { docNo: true, status: true, autoApproved: true, revisionCount: true, currencyCode: true, ...party.storedSelect, lines: { select: storedLineSelect } },
        }))!;
        const auto = isAutoApproved(stored);
        assertEditable(flowDoc(stored), auto ? await this.effects.usedBy(tx, id) : null, errors);
        const plan = saveStatus(requireApproval, { status: stored.status as string, autoApproved: stored.autoApproved as boolean });
        const target = { id, docNo: stored.docNo as string };
        if (plan.effects !== "none") await this.config.lockSources?.(tx, rawInput);
        if (plan.effects === "reapply") await this.effects.reverse(tx, target, now);
        const input = this.config.prepare ? await this.config.prepare(tx, rawInput, id) : rawInput;
        const partyColumns = await this.checkReferences(tx, input, stored);
        const header = this.headerData(input);
        const assigned = lineHook ? await lineHook.assign(tx, input, stored.lines as Row[]) : null;
        await this.doc(tx).update({ where: { id }, data: { ...header, ...lineTotals(input.lines), ...partyColumns, ...planData(plan, true, actorId, now) } });
        await this.child(tx, lineModel).deleteMany({ where: { [parentKey]: id } });
        await this.child(tx, chargeModel).deleteMany({ where: { [parentKey]: id } });
        await this.writeChildren(tx, id, input, assigned);
        const applied = plan.effects === "none" ? null : await this.effects.apply(tx, target, actorId, now);
        return {
          extra: assigned && lineHook ? lineHook.result(assigned) : {},
          flow: saveFlow(this.config.approvalType, plan, stored.revisionCount as number, requireApproval, viewer),
          applied,
          reapplied: plan.effects === "reapply",
        };
      }, WRITE_TX);
      const version = expectedVersion + 1;
      this.logger.log({ event: `${event}.updated`, actorId, id, version, status: saved.flow.status, reapplied: saved.reapplied, ...saved.applied?.log });
      return { id, version, ...saved.extra, ...saved.flow };
    } catch (error) {
      throw errors.map(error, "update");
    }
  }

  /**
   * Soft delete (ADR-0045 D4 as amended by ADR-0050): DRAFT / REVISION_REQUESTED, or auto-approved and not used (its
   * effects are reversed first, so the items it brought in leave with it). Pending, rejected and reviewed-approved
   * documents → STATUS_INVALID. The row keeps its Doc No., so the number is never reused (D5). The guarded version bump
   * locks the header (`FOR NO KEY UPDATE`) before `usedBy`, so a dependent holding it `FOR SHARE` (a Memo Out Return of
   * this Memo Out, a Purchase of this PO) finishes first and is then seen by `usedBy` (INV-20261111-002 F1).
   */
  async delete(actorId: string, id: string, expectedVersion: number) {
    const { errors, event } = this.config;
    let deleted: { docNo: string; reversed: boolean };
    try {
      deleted = await prisma.$transaction(async (tx) => {
        const now = new Date();
        await this.lockHeader(tx, id, expectedVersion, CHANGEABLE, actorId, now);
        const stored = (await this.doc(tx).findUnique({ where: { id }, select: { docNo: true, status: true, autoApproved: true, revisionCount: true } }))!;
        const auto = isAutoApproved(stored);
        assertEditable(flowDoc(stored), auto ? await this.effects.usedBy(tx, id) : null, errors);
        if (auto) await this.effects.reverse(tx, { id, docNo: stored.docNo as string }, now);
        await this.doc(tx).update({ where: { id }, data: { deletedAt: now, deletedBy: actorId } });
        return { docNo: stored.docNo as string, reversed: auto };
      }, WRITE_TX);
    } catch (error) {
      throw errors.map(error, "delete");
    }
    const version = expectedVersion + 1;
    this.logger.log({ event: `${event}.deleted`, actorId, id, docNo: deleted.docNo, version, reversed: deleted.reversed });
    return { ok: true as const, version };
  }

  /**
   * Restore (ADR-0045 D6/D7, clarification G3): a deleted document comes back as DRAFT (submitted_* and approval
   * cleared; a kept Revise stays) while the type's approval is ON, or as auto-approved with its effects re-applied while
   * OFF (refused with the effect error when stock is short). Legacy soft-deleted PENDING_APPROVAL rows follow the same rule.
   */
  async restore(actorId: string, id: string, expectedVersion: number) {
    const { errors, event } = this.config;
    let restored: { docNo: string; status: string; applied: { log: Row } | null };
    try {
      restored = await prisma.$transaction(async (tx) => {
        const requireApproval = await readApprovalSetting(tx, this.config.approvalType);
        const now = new Date();
        const locked = await this.doc(tx).updateMany({
          where: { id, version: expectedVersion, deletedAt: { not: null } },
          data: { deletedAt: null, deletedBy: null, version: { increment: 1 }, updatedAt: now, updatedBy: actorId },
        });
        if (locked.count === 0) explainRestoreMiss(errors, await this.missRow(id, tx));
        const stored = (await this.doc(tx).findUnique({ where: { id }, select: { docNo: true } }))!;
        const status = requireApproval ? "DRAFT" : "APPROVED";
        await this.doc(tx).update({ where: { id }, data: restoreData(requireApproval, actorId, now) });
        const applied = requireApproval ? null : await this.effects.apply(tx, { id, docNo: stored.docNo as string }, actorId, now);
        return { docNo: stored.docNo as string, status, applied };
      }, WRITE_TX);
    } catch (error) {
      throw errors.map(error, "restore");
    }
    const version = expectedVersion + 1;
    this.logger.log({ event: `${event}.restored`, actorId, id, docNo: restored.docNo, version, status: restored.status, ...restored.applied?.log });
    return { id, version, status: restored.status as Status };
  }

  /**
   * Send to approve (ADR-0050): DRAFT / REVISION_REQUESTED → PENDING_APPROVAL with submitted_at / by / by_name and
   * version + 1, after the full save validation on the stored document (party, currency, stone codes, amounts and the
   * type's line rules, e.g. Memo Stock availability). While the type's approval is OFF → `<CODE>_APPROVAL_OFF`.
   */
  async submit(actor: DocumentActor, id: string, expectedVersion: number) {
    const { errors, event } = this.config;
    const now = new Date();
    let docNo: string;
    // ADR-0049 as amended by ADR-0050: approvers hear about a document when it is sent to approve (no longer on create).
    const documentType = this.notificationType;
    const approvers = documentType ? await approverRecipients(documentType, actor.id) : [];
    let signal: NotificationSignal | null = null;
    try {
      docNo = await prisma.$transaction(async (tx) => {
        const requireApproval = await readApprovalSetting(tx, this.config.approvalType);
        const locked = await this.doc(tx).updateMany({
          where: { id, version: expectedVersion, status: { in: [...SUBMITTABLE] }, deletedAt: null },
          data: { status: PENDING, submittedAt: now, submittedBy: actor.id, submittedByName: actor.name, version: { increment: 1 }, updatedAt: now, updatedBy: actor.id },
        });
        if (locked.count === 0) explainMiss(errors, await this.missRow(id, tx), SUBMITTABLE);
        if (!requireApproval) throw errors.approvalOff();
        const storedDocNo = await this.validateStored(tx, id);
        if (documentType) {
          signal = await recordNotification(tx, {
            type: "approval.pending",
            documentType,
            documentId: id,
            docNo: storedDocNo,
            actorId: actor.id,
            recipients: approvers,
            summary: await this.notificationSummary(tx, id),
          });
        }
        return storedDocNo;
      }, WRITE_TX);
    } catch (error) {
      throw errors.map(error, "submit");
    }
    emitNotificationSignals([signal]);
    const version = expectedVersion + 1;
    this.logger.log({ event: `${event}.submitted`, actorId: actor.id, id, docNo, version });
    return { id, version, status: PENDING as "PENDING_APPROVAL", submittedAt: now.toISOString() };
  }

  /**
   * PENDING_APPROVAL → APPROVED (approved_at / by, version + 1) in one guarded UPDATE that serializes approvals of the
   * document, then the type's effects under their row locks (`<CODE>_PENDING_SHORT` etc. roll everything back).
   * D8 miss order: NOT_FOUND → DELETED → STATUS_INVALID → CHANGED.
   */
  async approve(actorId: string, id: string, expectedVersion: number) {
    const { errors, event } = this.config;
    try {
      const approved = await prisma.$transaction((tx) => this.approveBody(tx, actorId, id, expectedVersion), WRITE_TX);
      emitNotificationSignals(approved.signals);
      this.logger.log({ event: `${event}.approved`, actorId, id, docNo: approved.docNo, ...approved.log });
      return { id, version: expectedVersion + 1, status: "APPROVED" as const, ...approved.result };
    } catch (error) {
      throw errors.map(error, "approve");
    }
  }

  /**
   * The same approve inside the caller's transaction (go-live command `scripts/approve-pending.ts`, ADR-0050 D7: its
   * dry run approves each document in its own transaction that is rolled back at once, INV-20261111-002 H2). Errors are mapped like
   * `approve`; the caller owns commit / rollback and logging.
   */
  async approveWithin(tx: Tx, actorId: string, id: string, expectedVersion: number) {
    try {
      const approved = await this.approveBody(tx, actorId, id, expectedVersion);
      return { id, docNo: approved.docNo, version: expectedVersion + 1, status: "APPROVED" as const, ...approved.result };
    } catch (error) {
      throw this.config.errors.map(error, "approve");
    }
  }

  private async approveBody(tx: Tx, actorId: string, id: string, expectedVersion: number) {
    const now = new Date();
    const updated = await this.doc(tx).updateMany({
      where: { id, version: expectedVersion, status: PENDING, deletedAt: null },
      data: { status: "APPROVED", approvedAt: now, approvedBy: actorId, version: { increment: 1 }, updatedAt: now, updatedBy: actorId },
    });
    if (updated.count === 0) explainMiss(this.config.errors, await this.missRow(id, tx), [PENDING]);
    const stored = (await this.doc(tx).findUnique({ where: { id }, select: { docNo: true } }))!;
    const applied = await this.effects.apply(tx, { id, docNo: stored.docNo as string }, actorId, now);
    // ADR-0049: the creator hears about the approval once the transaction commits (approve emits; the go-live command
    // only records, its readers see the rows on their next fetch).
    const signals = await this.notifyApproved(tx, id, actorId);
    return { docNo: stored.docNo as string, signals, ...applied };
  }

  /** ADR-0046 D3: PENDING_APPROVAL → REJECTED (final) with the reason; no stock is touched. */
  reject(actor: DocumentActor, id: string, expectedVersion: number, reason: string) {
    return this.review(actor, id, expectedVersion, "REJECT", reason);
  }

  /** ADR-0046 D3 / ADR-0050: PENDING_APPROVAL → REVISION_REQUESTED once (`<CODE>_REVISE_LIMIT` after); no stock is touched. */
  requestRevision(actor: DocumentActor, id: string, expectedVersion: number, note: string) {
    return this.review(actor, id, expectedVersion, "REVISE", note);
  }

  private async review(actor: DocumentActor, id: string, expectedVersion: number, action: "REJECT" | "REVISE", note: string) {
    const { errors, event } = this.config;
    const status = action === "REJECT" ? "REJECTED" : "REVISION_REQUESTED";
    try {
      const updated = await this.doc(prisma).updateMany(reviewUpdate(actor, id, expectedVersion, action, note, new Date()));
      if (updated.count === 0) explainReviewMiss(errors, await this.missRow(id), action);
    } catch (error) {
      throw errors.map(error, action === "REJECT" ? "reject" : "requestRevision");
    }
    const version = expectedVersion + 1;
    // D13: ids and the note length only, never the note.
    this.logger.log({ event: `${event}.${action === "REJECT" ? "rejected" : "revision_requested"}`, actorId: actor.id, id, version, noteLength: note.length });
    return { id, version, status: status as "REJECTED" | "REVISION_REQUESTED" };
  }

  /**
   * Header lock of update / delete: one guarded version bump (`updated_at/by` too) that only a live document at
   * `expectedVersion` in `allowed` passes; a miss is explained in D8 order. The caller's later checks roll it back.
   */
  private async lockHeader(tx: Tx, id: string, expectedVersion: number, allowed: readonly string[], actorId: string, now: Date) {
    const locked = await this.doc(tx).updateMany({
      where: { id, version: expectedVersion, status: { in: [...allowed] }, deletedAt: null },
      data: { version: { increment: 1 }, updatedAt: now, updatedBy: actorId },
    });
    if (locked.count === 0) {
      // Status first (as before ADR-0050): a document that left its editable state reports that, not a stale version.
      const row = (await this.doc(tx).findUnique({ where: { id }, select: { ...MISS_SELECT, autoApproved: true } })) as (MissRow & { autoApproved?: boolean }) | null;
      const editable = row !== null && isEditableStatus({ status: row.status, autoApproved: row.autoApproved === true });
      explainMiss(this.config.errors, row, editable ? allowed : []);
    }
  }

  /** `submit`'s save validation on the stored content: the type's `prepare`, references and amount bounds. */
  private async validateStored(tx: Tx, id: string): Promise<string> {
    const row = (await this.doc(tx).findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } }, charges: true } }))!;
    const input = storedInput(row) as unknown as Input;
    const prepared = this.config.prepare ? await this.config.prepare(tx, input, id) : input;
    await this.checkReferences(tx, prepared, row);
    this.headerData(prepared);
    return row.docNo as string;
  }

  private async missRow(id: string, client: Client = prisma): Promise<MissRow> {
    return (await this.doc(client).findUnique({ where: { id }, select: MISS_SELECT })) as MissRow;
  }

  /** Document Setup row in effect on the doc date: prefix + separator + max + 1; none → plain 1, 2, 3 … */
  private async issueNumber(client: Client, docDate: string, lock: boolean) {
    const { document, transactionKey } = this.config;
    const numbering = await numberingInEffect(client, transactionKey, toDbDate(docDate), lock);
    if (!numbering) {
      const runningNo = await nextPlainRunningNo(client, document, lock);
      return { numberingId: null, runningNo, docNo: String(runningNo) };
    }
    const runningNo = await nextRunningNo(client, document, numbering);
    return { numberingId: numbering.id, runningNo, docNo: formatDocNo(numbering, runningNo) };
  }

  /**
   * Party, currency and stone codes must be valid; a value already stored on the document may stay even if it
   * became inactive. A foreign currency needs an exchange rate. Returns the party columns.
   */
  private async checkReferences(tx: Tx, input: Input, stored: Row | null): Promise<Row> {
    const { columns, errors } = await this.config.party.check(tx, input, stored);
    if (!(await isCurrencyAllowed(tx, input.currency, stored?.currencyCode as string | undefined))) errors.push({ path: "currency", code: "unknown" });
    const storedStoneCodes = new Set(((stored?.lines as { stoneCodeId?: string | null }[] | undefined) ?? []).flatMap((line) => (line.stoneCodeId ? [line.stoneCodeId] : [])));
    const stoneCodeIds = [...new Set(input.lines.flatMap((line) => (line.stoneCodeId ? [line.stoneCodeId] : [])))];
    if (stoneCodeIds.length > 0) {
      const found = await tx.stoneCode.findMany({ where: { id: { in: stoneCodeIds } }, select: { id: true, active: true } });
      const active = new Map(found.map((row) => [row.id, row.active]));
      input.lines.forEach((line, index) => {
        if (!line.stoneCodeId) return;
        const isActive = active.get(line.stoneCodeId);
        if (isActive === undefined || (!isActive && !storedStoneCodes.has(line.stoneCodeId))) errors.push({ path: `lines.${index}.stoneCodeId`, code: "invalid_reference" });
      });
    }
    if (errors.length > 0) throw this.config.errors.referenceInvalid(errors);
    const company = await tx.companyProfile.findUnique({ where: { id: COMPANY_PROFILE_ID }, select: { currencyCode: true } });
    if (company && company.currencyCode !== input.currency && input.exchangeRate === null) {
      throw validationException([{ path: "exchangeRate", code: "required" }]);
    }
    return columns;
  }

  private headerData(input: Input) {
    const totals = totalsOf(input);
    // Amounts must fit DECIMAL(18,2); otherwise the write would fail as a database error.
    const oversize = oversizeAmounts(totals);
    if (oversize.length > 0) throw validationException(oversize.map((path) => ({ path, code: "too_big" })));
    return {
      docDate: toDbDate(input.docDate),
      dueDate: toDbDate(input.dueDate),
      currencyCode: input.currency,
      exchangeRate: input.exchangeRate,
      ref: input.ref,
      documentNote: input.documentNote,
      discountType: input.discount.type,
      discountValue: input.discount.type === "NONE" ? "0" : input.discount.value,
      taxEnabled: input.tax.enabled,
      taxRate: input.tax.rate,
      taxIncluded: input.tax.includeInPrice,
      laborWork: input.labor?.work ?? null,
      laborBasis: input.labor?.basis ?? null,
      laborQty: input.labor?.qty ?? null,
      laborRate: input.labor?.rate ?? null,
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      priceBeforeTax: totals.priceBeforeTax,
      taxAmount: totals.taxAmount,
      chargesAmount: totals.chargesAmount,
      laborAmount: totals.laborAmount,
      grandTotal: totals.grandTotal,
    };
  }

  /** Lines and charges, written in batches (≤ 2 statements, plus the line hook's). `assigned` = line hook columns by position. */
  private async writeChildren(tx: Tx, documentId: string, input: Input, assigned: Row[] | null = null) {
    const { lineModel, chargeModel, parentKey, lineOmit = [] } = this.config;
    const { lineAmounts, lineDiscounts } = totalsOf(input);
    const lines = input.lines.map((line, index) => omit({
      id: uuidV7(),
      [parentKey]: documentId,
      position: index + 1,
      source: line.source,
      stoneCodeId: line.stoneCodeId,
      stoneCodeSnapshot: line.stoneCode,
      stone: line.stone,
      shape: line.shape,
      size: line.size,
      color: line.color,
      clarity: line.clarity,
      cutting: line.cutting,
      quality: line.quality,
      lot: line.lot,
      location: line.location,
      cerType: line.cerType,
      cerNo: line.cerNo,
      pcs: line.pcs,
      weightCt: line.weightCt,
      priceUnit: line.priceUnit,
      unitPrice: line.unitPrice,
      discountType: line.discount.type,
      discountValue: line.discount.type === "NONE" ? "0" : line.discount.value,
      discountAmount: lineDiscounts[index],
      amount: lineAmounts[index],
      itemNote: line.itemNote,
      ...(this.config.outstanding
        ? { outstandingPcs: (line as OutstandingLine).outstandingPcs, outstandingWeightCt: (line as OutstandingLine).outstandingWeightCt }
        : {}),
      ...assigned?.[index],
    }, lineOmit));
    await this.child(tx, lineModel).createMany({ data: lines });
    await this.config.lineHook?.afterLines?.(tx, input, lines.map((line) => line.id as string));
    if (input.serviceCharges.length > 0) {
      await this.child(tx, chargeModel).createMany({ data: input.serviceCharges.map((charge) => ({ [parentKey]: documentId, chargeType: charge.type, amount: charge.amount })) });
    }
  }

  /** Contract output: the quotation document shape with this document's party fields. */
  private toDetail(row: Row) {
    const lines = row.lines as Row[];
    const charges = row.charges as Row[];
    return {
      id: row.id as string,
      docNo: row.docNo as string,
      status: row.status as Status,
      version: row.version as number,
      docDate: fromDbDate(row.docDate as Date),
      dueDate: fromDbDate(row.dueDate as Date),
      ...this.config.party.output(row),
      currency: row.currencyCode as string,
      exchangeRate: text(row.exchangeRate),
      ref: row.ref as string,
      documentNote: row.documentNote as string,
      lines: lines.map((line) => this.lineOutput(line, {
        id: line.id as string,
        source: line.source as "MANUAL",
        stoneCodeId: line.stoneCodeId as string | null,
        stoneCode: line.stoneCodeSnapshot as string,
        stone: line.stone as string,
        shape: line.shape as string,
        size: line.size as string,
        color: line.color as string,
        clarity: line.clarity as string,
        cutting: line.cutting as string,
        quality: line.quality as string,
        lot: line.lot as string,
        location: line.location as string,
        cerType: line.cerType as string,
        cerNo: line.cerNo as string,
        pcs: line.pcs as number,
        weightCt: (line.weightCt as Dec).toFixed(3),
        priceUnit: line.priceUnit as "PER_CT" | "PER_PCS",
        unitPrice: money(line.unitPrice),
        discount: { type: line.discountType as "NONE" | "PERCENT" | "AMOUNT", value: (line.discountValue as Dec).toString() },
        discountAmount: money(line.discountAmount),
        amount: money(line.amount),
        itemNote: line.itemNote as string,
        photoIds: [] as string[],
        // Only documents with `outstanding` lines (memo out return) have these columns.
        outstandingPcs: line.outstandingPcs === undefined ? null : (line.outstandingPcs as number),
        outstandingWeightCt: line.outstandingWeightCt === undefined ? null : (line.outstandingWeightCt as Dec).toFixed(3),
      })),
      discount: { type: row.discountType as "NONE" | "PERCENT" | "AMOUNT", value: (row.discountValue as Dec).toString() },
      tax: { enabled: row.taxEnabled as boolean, rate: (row.taxRate as Dec).toString(), includeInPrice: row.taxIncluded as boolean },
      serviceCharges: [...charges]
        .sort((a, b) => CHARGE_TYPES.indexOf(a.chargeType as never) - CHARGE_TYPES.indexOf(b.chargeType as never))
        .map((charge) => ({ type: charge.chargeType as (typeof CHARGE_TYPES)[number], amount: money(charge.amount) })),
      labor: row.laborWork === null || row.laborBasis === null || row.laborQty === null || row.laborRate === null
        ? null
        : { work: row.laborWork as string, basis: row.laborBasis as "PCS" | "WEIGHT", qty: (row.laborQty as Dec).toString(), rate: money(row.laborRate) },
      totals: {
        subtotal: money(row.subtotal),
        discountAmount: money(row.discountAmount),
        priceBeforeTax: money(row.priceBeforeTax),
        taxAmount: money(row.taxAmount),
        chargesAmount: money(row.chargesAmount),
        laborAmount: money(row.laborAmount),
        grandTotal: money(row.grandTotal),
      },
      ...this.config.detailExtra?.(row),
      createdAt: (row.createdAt as Date).toISOString(),
      createdBy: row.createdBy as string,
      updatedAt: (row.updatedAt as Date).toISOString(),
      // D10: non-null = deleted, shown read-only.
      deletedAt: isoOrNull(row.deletedAt),
      deletedBy: (row.deletedBy as string | null | undefined) ?? null,
    };
  }

  /** Default line output, or the line hook's (memo receive: no stone code id / location, plus Stock ID). */
  private lineOutput<T extends Row>(line: Row, base: T): T {
    return this.config.lineHook ? (this.config.lineHook.output(line, base) as T) : base;
  }
}

const CLEAR_REVIEW = { reviewAction: null, reviewNote: null, reviewedAt: null, reviewedBy: null, reviewedByName: null } as const;
const CLEAR_SUBMITTED = { submittedAt: null, submittedBy: null, submittedByName: null } as const;

const isAutoApproved = (row: Row) => row.status === "APPROVED" && row.autoApproved === true;
const flowDoc = (row: Row) => ({ status: row.status as string, autoApproved: row.autoApproved as boolean, revisionCount: row.revisionCount as number, deletedAt: null });
const revisionCountOf = (row: Row) => (((row.revisionCount as number | undefined) ?? 0) >= 1 ? 1 : 0) as 0 | 1;

/**
 * Columns a Save writes for its plan: a DRAFT stays a DRAFT; DRAFT → APPROVED (OFF) records the saver as approver,
 * `auto_approved`, and (on update) clears a review kept from a restored revision (auto_approved_check); a reapply keeps
 * the first approval; REVISION_REQUESTED stays unchanged.
 */
export function planData(plan: SavePlan, isUpdate: boolean, actorId: string, now: Date): Row {
  if (plan.status === "DRAFT") return { status: "DRAFT", autoApproved: false };
  if (plan.status === "REVISION_REQUESTED" || plan.effects === "reapply") return {};
  return { status: "APPROVED", autoApproved: true, approvedAt: now, approvedBy: actorId, ...(isUpdate ? CLEAR_REVIEW : {}) };
}

/** G3: restore → DRAFT (approval ON) or auto-approved APPROVED (OFF); never pending, submitted_* always cleared. */
export function restoreData(requireApproval: boolean, actorId: string, now: Date): Row {
  return requireApproval
    ? { status: "DRAFT", autoApproved: false, approvedAt: null, approvedBy: null, ...CLEAR_SUBMITTED }
    : { status: "APPROVED", autoApproved: true, approvedAt: now, approvedBy: actorId, ...CLEAR_SUBMITTED, ...CLEAR_REVIEW };
}

/** One guarded review UPDATE (ADR-0046 D3): only a live PENDING_APPROVAL at `expectedVersion`; Revise also below the limit. */
export function reviewUpdate(actor: DocumentActor, id: string, expectedVersion: number, action: "REJECT" | "REVISE", note: string, now: Date) {
  return {
    where: { id, version: expectedVersion, status: PENDING, deletedAt: null, ...(action === "REVISE" ? { revisionCount: { lt: REVISE_LIMIT } } : {}) },
    data: {
      status: action === "REJECT" ? "REJECTED" : "REVISION_REQUESTED",
      reviewAction: action, reviewNote: note, reviewedAt: now, reviewedBy: actor.id, reviewedByName: actor.name,
      ...(action === "REVISE" ? { revisionCount: { increment: 1 } } : {}),
      version: { increment: 1 }, updatedAt: now, updatedBy: actor.id,
    },
  };
}

export function reviewOfRow(row: Row) {
  const action = row.reviewAction;
  if ((action !== "REVISE" && action !== "REJECT") || typeof row.reviewNote !== "string" || !(row.reviewedAt instanceof Date)) return null;
  return { action: action as "REVISE" | "REJECT", note: row.reviewNote, at: row.reviewedAt.toISOString(), byName: (row.reviewedByName as string | null | undefined) ?? null };
}

/** `Flow` of a stored header row for `viewer` (api-contract "Shared types"), plus the ADR-0046 submitted fields. */
export function documentFlow(row: Row, type: ApprovalDocType, requireApproval: boolean, usedBy: string | null, viewer: FlowPrincipal | null) {
  const doc = {
    status: row.status as string,
    autoApproved: row.autoApproved as boolean,
    revisionCount: row.revisionCount as number,
    deletedAt: (row.deletedAt as Date | null | undefined) ?? null,
    reviewAction: (row.reviewAction as string | null | undefined) ?? null,
    reviewNote: (row.reviewNote as string | null | undefined) ?? null,
    reviewedAt: (row.reviewedAt as Date | null | undefined) ?? null,
    reviewedByName: (row.reviewedByName as string | null | undefined) ?? null,
  };
  return {
    ...flowFlags({ doc, type, requireApproval, principal: viewer ?? NO_GRANTS, usedBy }),
    submittedAt: isoOrNull(row.submittedAt),
    submittedByName: (row.submittedByName as string | null | undefined) ?? null,
  };
}

/** The `Flow` fields a create / update result carries (a document just saved is not used by another one; no review). */
export function saveFlow(type: ApprovalDocType, plan: SavePlan, revisionCount: number, requireApproval: boolean, viewer: FlowPrincipal | null) {
  const { review: _review, ...flow } = flowFlags({
    doc: { status: plan.status, autoApproved: plan.autoApproved, revisionCount, deletedAt: null, reviewAction: null, reviewNote: null, reviewedAt: null, reviewedByName: null },
    type, requireApproval, principal: viewer ?? NO_GRANTS, usedBy: null,
  });
  return flow;
}

const decText = (value: unknown, places?: number) => (value === null || value === undefined ? value : places === undefined ? (value as Dec).toString() : (value as Dec).toFixed(places));

/**
 * The stored document as a Save input (submit's validation): header fields, lines with their source columns and
 * decimals as strings, charges and labor — what `prepare` and the reference checks read.
 */
export function storedInput(row: Row) {
  const lines = (row.lines as Row[]).map((line) => ({
    ...line,
    stoneCode: line.stoneCodeSnapshot,
    weightCt: decText(line.weightCt, 3),
    unitPrice: decText(line.unitPrice, 2),
    discount: { type: line.discountType, value: decText(line.discountValue) },
    outstandingWeightCt: decText(line.outstandingWeightCt, 3),
    photoIds: [],
  }));
  return {
    ...row,
    docDate: fromDbDate(row.docDate as Date),
    dueDate: fromDbDate(row.dueDate as Date),
    currency: row.currencyCode,
    exchangeRate: text(row.exchangeRate),
    discount: { type: row.discountType, value: decText(row.discountValue) },
    tax: { enabled: row.taxEnabled, rate: decText(row.taxRate), includeInPrice: row.taxIncluded },
    serviceCharges: ((row.charges as Row[] | undefined) ?? []).map((charge) => ({ type: charge.chargeType, amount: decText(charge.amount, 2) })),
    labor: row.laborWork === null || row.laborBasis === null || row.laborQty === null || row.laborRate === null
      ? null
      : { work: row.laborWork, basis: row.laborBasis, qty: decText(row.laborQty), rate: decText(row.laborRate, 2) },
    lines,
  };
}

/** Totals with the quotation calculator; it reads only the price fields every engine line has. */
function totalsOf(input: TradeDocumentInput) {
  return calculateTotals(input as unknown as Parameters<typeof calculateTotals>[0]);
}

function omit(row: Row, keys: readonly string[]): Row {
  if (keys.length === 0) return row;
  const copy = { ...row };
  for (const key of keys) delete copy[key];
  return copy;
}

function encodeCursor(docDate: string, createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ d: docDate, c: createdAt, i: id, v: 1 }), "utf8").toString("base64url");
}

function decodeCursor(value: string): { docDate: string; createdAt: string; id: string } {
  const invalid = () => validationException([{ path: "cursor", code: "invalid" }]);
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(value)) throw invalid();
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (!parsed.success) throw invalid();
    return { docDate: parsed.data.d, createdAt: parsed.data.c, id: parsed.data.i };
  } catch {
    throw invalid();
  }
}
