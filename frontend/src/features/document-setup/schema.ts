import { z } from "zod";
import { todayIso } from "./numbering";

/** Contract shapes (document-setup SA rev 1, `documentSetup.list/get/save`). */
export type DocumentTransaction = { transactionKey: string; label: string; defaultCode: string; configured: boolean; code: string | null };
export type NumberingRow = { id: string; effectiveDate: string; prefix: string; separator: string; startNo: number; used: boolean };
export type DocumentSetupDetail = {
  transactionKey: string;
  name: string;
  code: string;
  startFrom: number;
  declaration: string;
  version: number;
  updatedAt: string;
  rows: NumberingRow[];
};

/** Form values: numbers stay strings while typing (digits only). `key` keeps a row's identity when re-sorted. */
export type NumberingRowValues = { key: string; effectiveDate: string; prefix: string; separator: string; startNo: string; used: boolean };
export type DocumentSetupFormValues = { name: string; code: string; startFrom: string; rows: NumberingRowValues[]; declaration: string };

export const NUMBER_MAX = 999_999_999;
export const ROWS_MAX = 50;
export const DECLARATION_MAX = 2_000;

let rowSeq = 0;
export function newRowKey(): string {
  rowSeq += 1;
  return `row-${rowSeq}`;
}

const numberText = (required: string) =>
  z.string().superRefine((value, ctx) => {
    const text = value.trim();
    if (text === "") ctx.addIssue({ code: "custom", message: required });
    else if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > NUMBER_MAX) ctx.addIssue({ code: "custom", message: "Enter a number from 1 to 999,999,999" });
  });

const rowSchema = z.object({
  key: z.string(),
  effectiveDate: z.string().refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Date is required"),
  prefix: z.string().refine((value) => /^[A-Za-z0-9./-]{0,10}$/.test(value.trim()), "Use up to 10 letters, digits, - / or ."),
  separator: z.string().refine((value) => /^[-/._]{0,3}$/.test(value), "Use up to 3 of - / . _"),
  startNo: numberText("Start No is required"),
  used: z.boolean(),
});

/** form-guidelines.md (UI rev 1). */
export const documentSetupFormSchema = z.object({
  name: z.string().superRefine((value, ctx) => {
    const text = value.trim();
    if (text === "") ctx.addIssue({ code: "custom", message: "Name is required" });
    else if (text.length > 120) ctx.addIssue({ code: "custom", message: "Name must be at most 120 characters" });
  }),
  code: z.string().superRefine((value, ctx) => {
    const text = value.trim();
    if (text === "") ctx.addIssue({ code: "custom", message: "Code is required" });
    else if (!/^[A-Za-z0-9/-]{1,10}$/.test(text)) ctx.addIssue({ code: "custom", message: "Use up to 10 letters, digits, - or /" });
  }),
  startFrom: numberText("Start From is required"),
  rows: z.array(rowSchema).superRefine((rows, ctx) => {
    if (rows.length === 0) ctx.addIssue({ code: "custom", message: "Add at least one numbering row" });
    if (rows.length > ROWS_MAX) ctx.addIssue({ code: "custom", message: "Up to 50 rows" });
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      if (row.effectiveDate !== "" && seen.has(row.effectiveDate)) {
        ctx.addIssue({ code: "custom", path: [index, "effectiveDate"], message: "Another row already starts on this date" });
      }
      seen.add(row.effectiveDate);
    });
  }),
  declaration: z.string().max(DECLARATION_MAX, "Declaration must be at most 2,000 characters"),
});

/** Defaults for a transaction that was never set up (UI rev 1): Name = label uppercase, one row today. */
export function defaultFormValues(transaction: Pick<DocumentTransaction, "label" | "defaultCode">, today = todayIso()): DocumentSetupFormValues {
  return {
    name: transaction.label.toUpperCase(),
    code: transaction.defaultCode,
    startFrom: "1",
    rows: [{ key: newRowKey(), effectiveDate: today, prefix: transaction.defaultCode, separator: "-", startNo: "1", used: false }],
    declaration: "",
  };
}

export function toFormValues(detail: DocumentSetupDetail): DocumentSetupFormValues {
  return {
    name: detail.name,
    code: detail.code,
    startFrom: String(detail.startFrom),
    rows: detail.rows.map((row) => ({ key: newRowKey(), effectiveDate: row.effectiveDate, prefix: row.prefix, separator: row.separator, startNo: String(row.startNo), used: row.used })),
    declaration: detail.declaration,
  };
}

/** New row (FE-DS-004): Date today, Prefix/Separator copied from the last row (or Code), Start No = Start From. */
export function newRowValues(values: Pick<DocumentSetupFormValues, "code" | "startFrom" | "rows">, today = todayIso()): NumberingRowValues {
  const last = values.rows.at(-1);
  return {
    key: newRowKey(),
    effectiveDate: today,
    prefix: last ? last.prefix : values.code.trim().toUpperCase(),
    separator: last ? last.separator : "-",
    startNo: values.startFrom.trim() === "" ? "1" : values.startFrom.trim(),
    used: false,
  };
}

/** Form → `documentSetup.save` input; rows sorted by date. `version` null = first save. */
export function toSaveInput(transactionKey: string, values: DocumentSetupFormValues, version: number | null) {
  return {
    transactionKey,
    name: values.name.trim(),
    code: values.code.trim().toUpperCase(),
    startFrom: Number(values.startFrom.trim()),
    rows: [...values.rows]
      .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
      .map((row) => ({ effectiveDate: row.effectiveDate, prefix: row.prefix.trim().toUpperCase(), separator: row.separator, startNo: Number(row.startNo.trim()) })),
    declaration: values.declaration.trimEnd(),
    expectedVersion: version,
  };
}
