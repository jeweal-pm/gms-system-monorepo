import type { FieldError } from "../common/errors";
import { currencyOptions } from "../currency/currency-directory";
import { prisma } from "../database/prisma-client";
import { CHARGE_TYPES } from "../quotation/quotation.schemas";
import { formatAddress, stoneLineOptions } from "../quotation/quotation.service";
import type { PartyAdapter, TradeDocumentInput } from "./document-engine";
import type { DocumentErrors } from "./document-errors";

/**
 * Vendor + one of its addresses, shared by the vendor documents: memo out return (owner 2026-10-28 "Memo Out Return
 * ใช้ ข้อมูลจาก vendor", SA-MOR-05), memo receive and memo return (memo-return SA rev 1).
 */
export type VendorOut = { vendorId: string; vendor: { code: string; name: string }; addressId: string | null; addressText: string };
type VendorInput = TradeDocumentInput & { vendorId: string; addressId: string };

const VENDOR_OPTIONS_LIMIT = 1_000;

export function vendorParty<Input extends VendorInput>(errors: DocumentErrors): PartyAdapter<Input, VendorOut> {
  return {
    storedSelect: { vendorId: true },
    nameColumn: "vendorNameSnapshot",
    listNameKey: "vendorName",
    partyColumn: "vendorId",
    async check(tx, input, stored) {
      const fieldErrors: FieldError[] = [];
      const vendor = await tx.vendor.findUnique({ where: { id: input.vendorId }, select: { code: true, name: true, active: true, addresses: true } });
      if (!vendor || (!vendor.active && input.vendorId !== stored?.vendorId)) throw errors.referenceInvalid([{ path: "vendorId", code: "invalid_reference" }]);
      const address = vendor.addresses.find((entry) => entry.id === input.addressId);
      if (!address) fieldErrors.push({ path: "addressId", code: "invalid_reference" });
      return {
        errors: fieldErrors,
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
}

/** Active vendors with their addresses (plus a stored inactive one), currencies and the stone lists. */
export async function vendorDocumentOptions(includeVendorId: string | undefined, errors: DocumentErrors) {
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
    throw errors.map(error, "options");
  }
}
