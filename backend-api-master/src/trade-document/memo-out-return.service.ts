import { Injectable } from "@nestjs/common";
import type { FieldError } from "../common/errors";
import { currencyOptions } from "../currency/currency-directory";
import { prisma } from "../database/prisma-client";
import { CHARGE_TYPES } from "../quotation/quotation.schemas";
import { formatAddress, stoneLineOptions } from "../quotation/quotation.service";
import { documentErrors } from "./document-errors";
import { TradeDocumentEngine, type DocumentListInput, type PartyAdapter } from "./document-engine";
import type { MemoOutReturnInput } from "./memo-schemas";

export const memoOutReturnErrors = documentErrors("MEMO_OUT_RETURN", "MemoOutReturn", "memo_out_return");
const VENDOR_OPTIONS_LIMIT = 1_000;

/** Vendor + one of its addresses (owner 2026-10-28: "Memo Out Return ใช้ ข้อมูลจาก vendor", SA-MOR-05). */
type VendorOut = { vendorId: string; vendor: { code: string; name: string }; addressId: string | null; addressText: string };

const vendorParty: PartyAdapter<MemoOutReturnInput, VendorOut> = {
  storedSelect: { vendorId: true },
  nameColumn: "vendorNameSnapshot",
  listNameKey: "vendorName",
  partyColumn: "vendorId",
  async check(tx, input, stored) {
    const errors: FieldError[] = [];
    const vendor = await tx.vendor.findUnique({ where: { id: input.vendorId }, select: { code: true, name: true, active: true, addresses: true } });
    if (!vendor || (!vendor.active && input.vendorId !== stored?.vendorId)) throw memoOutReturnErrors.referenceInvalid([{ path: "vendorId", code: "invalid_reference" }]);
    const address = vendor.addresses.find((entry) => entry.id === input.addressId);
    if (!address) errors.push({ path: "addressId", code: "invalid_reference" });
    return {
      errors,
      columns: {
        vendorId: input.vendorId,
        vendorCodeSnapshot: vendor.code,
        vendorNameSnapshot: vendor.name,
        addressId: input.addressId,
        addressSnapshot: address ? formatAddress(address) : "",
      },
    };
  },
  output(row) {
    return {
      vendorId: row.vendorId as string,
      vendor: { code: row.vendorCodeSnapshot as string, name: row.vendorNameSnapshot as string },
      addressId: row.addressId as string | null,
      addressText: row.addressSnapshot as string,
    };
  },
};

/** memo-out-return SA rev 1 / ADR-0033: Document Setup key `memo-out-return`, drafts only, no stock posting yet. */
@Injectable()
export class MemoOutReturnService {
  private readonly engine = new TradeDocumentEngine<MemoOutReturnInput, VendorOut>({
    document: "memoOutReturn",
    transactionKey: "memo-out-return",
    event: "memo_out_return",
    model: "memoOutReturn",
    lineModel: "memoOutReturnLine",
    chargeModel: "memoOutReturnCharge",
    parentKey: "memoOutReturnId",
    errors: memoOutReturnErrors,
    party: vendorParty,
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
  create(actorId: string, input: MemoOutReturnInput) {
    return this.engine.create(actorId, input);
  }
  update(actorId: string, id: string, expectedVersion: number, input: MemoOutReturnInput) {
    return this.engine.update(actorId, id, expectedVersion, input);
  }
  delete(actorId: string, id: string, expectedVersion: number) {
    return this.engine.delete(actorId, id, expectedVersion);
  }

  /** Active vendors with their addresses (plus a stored inactive one), currencies and the stone lists. */
  async options(includeVendorId?: string) {
    try {
      const [stone, vendors, company, currencies] = await Promise.all([
        stoneLineOptions(),
        prisma.vendor.findMany({
          where: includeVendorId ? { OR: [{ active: true }, { id: includeVendorId }] } : { active: true },
          orderBy: [{ nameKey: "asc" }, { id: "asc" }],
          take: VENDOR_OPTIONS_LIMIT,
          select: { id: true, code: true, name: true, active: true, currencyCode: true, addresses: { orderBy: { position: "asc" } } },
        }),
        prisma.companyProfile.findUnique({ where: { id: 1 }, select: { currencyCode: true } }),
        currencyOptions(prisma),
      ]);
      return {
        vendors: vendors.map((vendor) => ({
          id: vendor.id,
          code: vendor.code,
          name: vendor.name,
          active: vendor.active,
          currency: vendor.currencyCode,
          addresses: vendor.addresses.map((address) => ({ id: address.id, label: formatAddress(address).split("\n").slice(0, 2).join(" · "), isDefault: address.isDefault })),
        })),
        currencies: currencies.filter((item) => item.active).map((item) => item.code),
        companyCurrency: company?.currencyCode ?? null,
        chargeTypes: [...CHARGE_TYPES],
        stone,
      };
    } catch (error) {
      throw memoOutReturnErrors.map(error, "options");
    }
  }
}
