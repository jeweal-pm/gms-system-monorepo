import { z } from "zod";
import { DOCUMENT_TRANSACTION_KEYS } from "./document-setup.transactions";

/** document-setup form-guidelines.md (UI rev 1): the server re-checks every rule. */
export const NUMBER_MAX = 999_999_999;
export const ROWS_MAX = 50;
export const DECLARATION_MAX = 2_000;

const runningNumber = z.number().int().min(1).max(NUMBER_MAX);

export const numberingRowSchema = z.object({
  effectiveDate: z.iso.date(),
  prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9./-]{0,10}$/),
  /** Owner label "Suffix": the text between Prefix and the number (Q-DS-04). */
  separator: z.string().regex(/^[-/._]{0,3}$/),
  startNo: runningNumber,
}).strict();

export const transactionKeySchema = z.enum(DOCUMENT_TRANSACTION_KEYS);

export const saveDocumentSetupBodySchema = z.object({
  transactionKey: transactionKeySchema,
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9/-]{1,10}$/),
  startFrom: runningNumber,
  rows: z.array(numberingRowSchema).min(1).max(ROWS_MAX).superRefine((rows, ctx) => {
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      if (seen.has(row.effectiveDate)) ctx.addIssue({ code: "custom", path: [index, "effectiveDate"], params: { code: "duplicate" }, message: "duplicate date" });
      seen.add(row.effectiveDate);
    });
  }),
  declaration: z.string().max(DECLARATION_MAX).transform((value) => value.trimEnd()),
  /** null = first save of this transaction (create); otherwise the version that was loaded. */
  expectedVersion: z.number().int().min(1).nullable(),
}).strict();

export type SaveDocumentSetupInput = z.output<typeof saveDocumentSetupBodySchema>;
