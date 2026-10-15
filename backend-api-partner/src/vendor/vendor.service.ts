import { Injectable, Logger } from "@nestjs/common";
import { validationException } from "../common/errors";
import { membershipErrors as sharedMembershipErrors } from "../common/partner-schemas";
import { addressDetail, listPage, scalarData, scalarDetail, SCALAR_FIELDS, WRITE_TX } from "../common/persistence";
import { OPTIONS_RESPONSE } from "../common/reference-data";
import { prisma } from "../database/prisma-client";
import { mapPersistenceError, vendorNotFound, vendorStale } from "./vendor.errors";
import type { ListQuery, UpdateVendorInput, VendorInput } from "./vendor.schemas";

/**
 * Position from array order; `isDefault` stored **exactly as sent** (D-V03): zero defaults stay
 * zero, nothing is promoted. More than one was already rejected by the schema.
 */
function addressRows(input: VendorInput) {
  return input.invoiceAddresses.map((address, index) => ({
    position: index + 1,
    name: address.name,
    taxId: address.taxId,
    address: address.address,
    countryCode: address.countryCode,
    state: address.state,
    city: address.city,
    postcode: address.postcode,
    isDefault: address.isDefault,
  }));
}

/** D-09 (reused): currency/country in the runtime lists, or equal to a value stored on this vendor. */
function membershipErrors(input: VendorInput, stored?: { currencyCode: string; countryCodes: Set<string> }) {
  return sharedMembershipErrors(input.currencyCode, [["invoiceAddresses", input.invoiceAddresses]], stored);
}

function vendorInput(input: UpdateVendorInput): VendorInput {
  const { expectedUpdatedAt: _expected, ...fields } = input;
  return fields;
}

@Injectable()
export class VendorService {
  private readonly logger = new Logger("Vendor");

  /** Same frozen object as `customer.options` (D-V04). */
  options() {
    return OPTIONS_RESPONSE;
  }

  list(query: ListQuery) {
    return listPage("vendor", query, mapPersistenceError);
  }

  async get(id: string) {
    let vendor;
    try {
      vendor = await prisma.vendor.findUnique({
        where: { id },
        include: { addresses: { orderBy: { position: "asc" } } },
      });
    } catch (error) {
      throw mapPersistenceError(error, "get");
    }
    if (!vendor) throw vendorNotFound();
    return {
      ...scalarDetail(vendor),
      invoiceAddresses: vendor.addresses.map((a) => ({ ...addressDetail(a), taxId: a.taxId })),
      createdAt: vendor.createdAt.toISOString(),
    };
  }

  async create(actorId: string, input: VendorInput) {
    const invalid = membershipErrors(input);
    if (invalid.length > 0) throw validationException(invalid);
    try {
      const created = await prisma.$transaction(async (tx) => {
        const now = new Date();
        return tx.vendor.create({
          data: { ...(await scalarData(tx, input)), createdAt: now, updatedAt: now, createdBy: actorId, updatedBy: actorId, addresses: { create: addressRows(input) } },
          select: { id: true, updatedAt: true },
        });
      }, WRITE_TX);
      this.logger.log({ event: "vendor.created", actorId, vendorId: created.id, invoiceAddressCount: input.invoiceAddresses.length });
      return { id: created.id, updatedAt: created.updatedAt.toISOString() };
    } catch (error) {
      throw mapPersistenceError(error, "create");
    }
  }

  /** Whole replacement with optimistic version (sequence 4); address set replaced with new IDs. */
  async update(actorId: string, id: string, body: UpdateVendorInput) {
    const input = vendorInput(body);
    const expected = new Date(body.expectedUpdatedAt);
    try {
      const result = await prisma.$transaction(async (tx) => {
        const stored = await tx.vendor.findUnique({ where: { id }, include: { addresses: { select: { countryCode: true } } } });
        if (!stored) throw vendorNotFound();
        const invalid = membershipErrors(input, { currencyCode: stored.currencyCode, countryCodes: new Set(stored.addresses.map((a) => a.countryCode)) });
        if (invalid.length > 0) throw validationException(invalid);

        const data = await scalarData(tx, input);
        // GREATEST(now, expected + 1 ms): the version always moves forward.
        const next = new Date(Math.max(Date.now(), expected.getTime() + 1));
        const updated = await tx.vendor.updateMany({ where: { id, updatedAt: expected }, data: { ...data, updatedAt: next, updatedBy: actorId } });
        if (updated.count === 0) {
          const exists = await tx.vendor.count({ where: { id } });
          throw exists === 0 ? vendorNotFound() : vendorStale();
        }
        await tx.vendorAddress.deleteMany({ where: { vendorId: id } });
        await tx.vendorAddress.createMany({ data: addressRows(input).map((row) => ({ ...row, vendorId: id })) });
        const changedFields = SCALAR_FIELDS.filter((field) => stored[field] !== data[field]);
        return { updatedAt: next, changedFields };
      }, WRITE_TX);
      this.logger.log({
        event: "vendor.updated", actorId, vendorId: id, changedFields: result.changedFields, addressesReplaced: true,
        invoiceAddressCount: input.invoiceAddresses.length,
      });
      return { id, updatedAt: result.updatedAt.toISOString() };
    } catch (error) {
      throw mapPersistenceError(error, "update");
    }
  }

  /** Hard delete, always allowed; addresses cascade (D-V05). Repeat delete returns 404. */
  async delete(actorId: string, id: string) {
    let count: number;
    try {
      ({ count } = await prisma.vendor.deleteMany({ where: { id } }));
    } catch (error) {
      throw mapPersistenceError(error, "delete");
    }
    if (count === 0) throw vendorNotFound();
    this.logger.log({ event: "vendor.deleted", actorId, vendorId: id });
    return { ok: true as const };
  }
}
