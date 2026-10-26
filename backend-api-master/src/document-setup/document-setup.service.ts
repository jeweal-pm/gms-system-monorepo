import { uuidV7 } from "@gms/storage";
import { Injectable, Logger } from "@nestjs/common";
import { WRITE_TX } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import type { DocumentNumbering, DocumentSetup } from "../generated/prisma/client";
import { documentSetupChanged, documentSetupCodeTaken, documentSetupNotFound, mapDocumentSetupError } from "./document-setup.errors";
import type { SaveDocumentSetupInput } from "./document-setup.schemas";
import { DOCUMENT_TRANSACTIONS, findTransaction } from "./document-setup.transactions";

type SetupRow = DocumentSetup & { rows: DocumentNumbering[] };

/** `@db.Date` round trip: "YYYY-MM-DD" <-> midnight UTC. */
export const toDbDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
export const fromDbDate = (value: Date) => value.toISOString().slice(0, 10);

/** Contract output (document-setup SA rev 1). `used` stays false until transactions issue numbers (Q-DS-06). */
export function toSetup(row: SetupRow) {
  return {
    transactionKey: row.transactionKey,
    name: row.name,
    code: row.code,
    startFrom: row.startFrom,
    declaration: row.declaration,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    rows: [...row.rows]
      .sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime())
      .map((item) => ({ id: item.id, effectiveDate: fromDbDate(item.effectiveDate), prefix: item.prefix, separator: item.separator, startNo: item.startNo, used: false })),
  };
}

@Injectable()
export class DocumentSetupService {
  private readonly logger = new Logger(DocumentSetupService.name);

  /** The fixed transaction list with whether each one has a saved setup. */
  async list() {
    try {
      const saved = await prisma.documentSetup.findMany({ select: { transactionKey: true, code: true } });
      const byKey = new Map(saved.map((item) => [item.transactionKey, item.code]));
      return {
        items: DOCUMENT_TRANSACTIONS.map((transaction) => ({
          transactionKey: transaction.key,
          label: transaction.label,
          defaultCode: transaction.defaultCode,
          configured: byKey.has(transaction.key),
          code: byKey.get(transaction.key) ?? null,
        })),
      };
    } catch (error) {
      throw mapDocumentSetupError(error, "list");
    }
  }

  /** `setup: null` = never saved; the client shows the defaults (UI rev 1). */
  async get(transactionKey: string) {
    if (!findTransaction(transactionKey)) throw documentSetupNotFound();
    try {
      const row = await prisma.documentSetup.findUnique({ where: { transactionKey }, include: { rows: true } });
      return { setup: row ? toSetup(row) : null };
    } catch (error) {
      throw mapDocumentSetupError(error, "get");
    }
  }

  /** Whole replacement of one transaction's setup and its numbering rows, in one transaction. */
  async save(actorId: string, input: SaveDocumentSetupInput) {
    try {
      const row = await prisma.$transaction(async (tx) => {
        const clash = await tx.documentSetup.findFirst({ where: { code: input.code, NOT: { transactionKey: input.transactionKey } }, select: { transactionKey: true } });
        if (clash) throw documentSetupCodeTaken();
        const now = new Date();
        const data = { name: input.name, code: input.code, startFrom: input.startFrom, declaration: input.declaration, updatedBy: actorId, updatedAt: now };
        if (input.expectedVersion === null) {
          await tx.documentSetup.create({ data: { transactionKey: input.transactionKey, ...data, version: 1 } });
        } else {
          const updated = await tx.documentSetup.updateMany({
            where: { transactionKey: input.transactionKey, version: input.expectedVersion },
            data: { ...data, version: { increment: 1 } },
          });
          if (updated.count === 0) throw documentSetupChanged();
          await tx.documentNumbering.deleteMany({ where: { transactionKey: input.transactionKey } });
        }
        await tx.documentNumbering.createMany({
          data: input.rows.map((item) => ({
            id: uuidV7(),
            transactionKey: input.transactionKey,
            effectiveDate: toDbDate(item.effectiveDate),
            prefix: item.prefix,
            separator: item.separator,
            startNo: item.startNo,
          })),
        });
        return tx.documentSetup.findUniqueOrThrow({ where: { transactionKey: input.transactionKey }, include: { rows: true } });
      }, WRITE_TX);
      this.logger.log({ event: input.expectedVersion === null ? "document_setup.created" : "document_setup.updated", actorId, transactionKey: row.transactionKey, version: row.version, rows: row.rows.length });
      return { setup: toSetup(row) };
    } catch (error) {
      throw mapDocumentSetupError(error, "save");
    }
  }
}
