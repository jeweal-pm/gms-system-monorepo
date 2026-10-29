import { Injectable } from "@nestjs/common";
import type { FieldError } from "../common/errors";
import { currencyOptions } from "../currency/currency-directory";
import { prisma } from "../database/prisma-client";
import { CHARGE_TYPES } from "../quotation/quotation.schemas";
import { customerLineOptions, formatAddress, stoneLineOptions } from "../quotation/quotation.service";
import { documentErrors } from "./document-errors";
import { TradeDocumentEngine, type DocumentListInput, type PartyAdapter } from "./document-engine";
import type { MemoOutInput } from "./memo-schemas";

export const memoOutErrors = documentErrors("MEMO_OUT", "MemoOut", "memo_out");

/** Customer + its SHIPPING and INVOICE address, like a quotation (memo-out SA-MO-05). */
type CustomerOut = {
  customerId: string;
  customer: { code: string; name: string };
  shippingAddressId: string | null;
  shippingAddressText: string;
  invoiceAddressId: string | null;
  invoiceAddressText: string;
};

const customerParty: PartyAdapter<MemoOutInput, CustomerOut> = {
  storedSelect: { customerId: true },
  nameColumn: "customerNameSnapshot",
  listNameKey: "customerName",
  partyColumn: "customerId",
  async check(tx, input, stored) {
    const errors: FieldError[] = [];
    const customer = await tx.customer.findUnique({ where: { id: input.customerId }, select: { code: true, name: true, active: true, addresses: true } });
    if (!customer || (!customer.active && input.customerId !== stored?.customerId)) throw memoOutErrors.referenceInvalid([{ path: "customerId", code: "invalid_reference" }]);
    const shipping = customer.addresses.find((address) => address.id === input.shippingAddressId && address.type === "SHIPPING");
    const invoice = customer.addresses.find((address) => address.id === input.invoiceAddressId && address.type === "INVOICE");
    if (!shipping) errors.push({ path: "shippingAddressId", code: "invalid_reference" });
    if (!invoice) errors.push({ path: "invoiceAddressId", code: "invalid_reference" });
    return {
      errors,
      columns: {
        customerId: input.customerId,
        customerCodeSnapshot: customer.code,
        customerNameSnapshot: customer.name,
        shippingAddressId: input.shippingAddressId,
        shippingAddressSnapshot: shipping ? formatAddress(shipping) : "",
        invoiceAddressId: input.invoiceAddressId,
        invoiceAddressSnapshot: invoice ? formatAddress(invoice) : "",
      },
    };
  },
  output(row) {
    return {
      customerId: row.customerId as string,
      customer: { code: row.customerCodeSnapshot as string, name: row.customerNameSnapshot as string },
      shippingAddressId: row.shippingAddressId as string | null,
      shippingAddressText: row.shippingAddressSnapshot as string,
      invoiceAddressId: row.invoiceAddressId as string | null,
      invoiceAddressText: row.invoiceAddressSnapshot as string,
    };
  },
};

/** memo-out SA rev 1 / ADR-0033: Document Setup key `memo-out`, drafts only, no stock posting yet. */
@Injectable()
export class MemoOutService {
  private readonly engine = new TradeDocumentEngine<MemoOutInput, CustomerOut>({
    document: "memoOut",
    transactionKey: "memo-out",
    event: "memo_out",
    model: "memoOut",
    lineModel: "memoOutLine",
    chargeModel: "memoOutCharge",
    parentKey: "memoOutId",
    errors: memoOutErrors,
    party: customerParty,
  });

  list(input: DocumentListInput) {
    return this.engine.list(input);
  }
  get(id: string) {
    return this.engine.get(id);
  }
  nextNumber(docDate: string) {
    return this.engine.nextNumber(docDate);
  }
  create(actorId: string, input: MemoOutInput) {
    return this.engine.create(actorId, input);
  }
  update(actorId: string, id: string, expectedVersion: number, input: MemoOutInput) {
    return this.engine.update(actorId, id, expectedVersion, input);
  }
  delete(actorId: string, id: string, expectedVersion: number) {
    return this.engine.delete(actorId, id, expectedVersion);
  }

  /** Same shape as `quotation.options`, so the page reuses the quotation header fields and item editor. */
  async options(includeCustomerId?: string) {
    try {
      const [stone, customers, company, setup, currencies] = await Promise.all([
        stoneLineOptions(),
        customerLineOptions(includeCustomerId),
        prisma.companyProfile.findUnique({ where: { id: 1 }, select: { currencyCode: true } }),
        prisma.documentSetup.findUnique({ where: { transactionKey: "memo-out" }, select: { transactionKey: true } }),
        currencyOptions(prisma),
      ]);
      return {
        customers,
        currencies: currencies.filter((item) => item.active).map((item) => item.code),
        companyCurrency: company?.currencyCode ?? null,
        chargeTypes: [...CHARGE_TYPES],
        numbering: { configured: setup !== null },
        stone,
      };
    } catch (error) {
      throw memoOutErrors.map(error, "options");
    }
  }
}
