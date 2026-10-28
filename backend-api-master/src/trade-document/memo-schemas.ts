import { z } from "zod";
import { LINES_MAX, lineInputSchema, tradeDocumentFields, tradeDocumentRules } from "../quotation/quotation.schemas";

/**
 * Inputs of memo out (customer + shipping/invoice address) and memo out return (vendor + address), ADR-0033:
 * the quotation trade-document fields and rules. Photos are not available on these documents yet, so a line
 * can't carry photo ids.
 */
const uuid = z.uuid();
const memoLineSchema = lineInputSchema.extend({ photoIds: z.array(uuid).max(0) });
const memoFields = { ...tradeDocumentFields, lines: z.array(memoLineSchema).min(1).max(LINES_MAX) };
const versioned = { id: uuid, expectedVersion: z.number().int().min(1) };

const memoOutFields = { ...memoFields, customerId: uuid, shippingAddressId: uuid, invoiceAddressId: uuid };
export const createMemoOutSchema = z.object(memoOutFields).strict().superRefine(tradeDocumentRules);
export const updateMemoOutSchema = z.object({ ...memoOutFields, ...versioned }).strict().superRefine(tradeDocumentRules);
export type MemoOutInput = z.output<typeof createMemoOutSchema>;

const memoOutReturnFields = { ...memoFields, vendorId: uuid, addressId: uuid };
export const createMemoOutReturnSchema = z.object(memoOutReturnFields).strict().superRefine(tradeDocumentRules);
export const updateMemoOutReturnSchema = z.object({ ...memoOutReturnFields, ...versioned }).strict().superRefine(tradeDocumentRules);
export type MemoOutReturnInput = z.output<typeof createMemoOutReturnSchema>;

export const memoVersionedIdSchema = z.object(versioned).strict();
export const memoNextNumberSchema = z.object({ docDate: z.iso.date() }).strict();
