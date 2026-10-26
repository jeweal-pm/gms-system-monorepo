import { Injectable, Logger } from "@nestjs/common";
import { validationException } from "../common/errors";
import { membershipErrors as sharedMembershipErrors } from "../common/partner-schemas";
import { addressDetail, listPage, nextPartnerCode, scalarData, scalarDetail, SCALAR_FIELDS, WRITE_TX } from "../common/persistence";
import { COUNTRY_OPTIONS } from "../common/reference-data";
import { currencyOptions, isCurrencyAllowed } from "../currency/currency-directory";
import { prisma } from "../database/prisma-client";
import { AddressType } from "../generated/prisma/client";
import { customerNotFound, customerStale, mapPersistenceError } from "./customer.errors";
import type { CustomerInput, ListQuery, UpdateCustomerInput } from "./customer.schemas";

type AddressInput = CustomerInput["invoiceAddresses"][number] | CustomerInput["shippingAddresses"][number];

/** Server-derived type/position; first entry becomes default when none is marked (architecture.md §7). */
function addressRows(type: AddressType, addresses: AddressInput[]) {
  const hasDefault = addresses.some((address) => address.isDefault);
  return addresses.map((address, index) => ({
    type,
    position: index + 1,
    name: address.name,
    taxId: type === AddressType.INVOICE && "taxId" in address ? address.taxId : null,
    address: address.address,
    countryCode: address.countryCode,
    state: address.state,
    city: address.city,
    postcode: address.postcode,
    isDefault: hasDefault ? address.isDefault : index === 0,
  }));
}

function allAddressRows(input: CustomerInput) {
  return [...addressRows(AddressType.INVOICE, input.invoiceAddresses), ...addressRows(AddressType.SHIPPING, input.shippingAddresses)];
}

/**
 * D-09: country in the runtime list, or equal to a value stored on this customer; the currency is active in
 * the currency master or equal to the stored one (currency SA-CUR-05).
 */
function membershipErrors(input: CustomerInput, currencyAllowed: boolean, storedCountryCodes?: ReadonlySet<string>) {
  return sharedMembershipErrors(currencyAllowed, [["invoiceAddresses", input.invoiceAddresses], ["shippingAddresses", input.shippingAddresses]], storedCountryCodes);
}

function customerInput(input: UpdateCustomerInput): CustomerInput {
  const { expectedUpdatedAt: _expected, ...fields } = input;
  return fields;
}

@Injectable()
export class CustomerService {
  private readonly logger = new Logger("Customer");

  /** Currencies from the currency master (currency SA-CUR-05); countries from the runtime list. */
  async options() {
    try {
      return { currencies: await currencyOptions(), countries: COUNTRY_OPTIONS };
    } catch (error) {
      throw mapPersistenceError(error, "options");
    }
  }

  list(query: ListQuery) {
    return listPage("customer", query, mapPersistenceError);
  }

  /** ADR-0021 §2: suggested next running Code Name (`C001` …); not reserved. */
  nextCode() {
    return nextPartnerCode("customer", mapPersistenceError);
  }

  async get(id: string) {
    let customer;
    try {
      customer = await prisma.customer.findUnique({
        where: { id },
        include: { addresses: { orderBy: [{ type: "asc" }, { position: "asc" }] } },
      });
    } catch (error) {
      throw mapPersistenceError(error, "get");
    }
    if (!customer) throw customerNotFound();
    return {
      ...scalarDetail(customer),
      invoiceAddresses: customer.addresses.filter((a) => a.type === AddressType.INVOICE).map((a) => ({ ...addressDetail(a), taxId: a.taxId })),
      shippingAddresses: customer.addresses.filter((a) => a.type === AddressType.SHIPPING).map(addressDetail),
      createdAt: customer.createdAt.toISOString(),
    };
  }

  async create(actorId: string, input: CustomerInput) {
    let currencyAllowed: boolean;
    try {
      currencyAllowed = await isCurrencyAllowed(prisma, input.currencyCode);
    } catch (error) {
      throw mapPersistenceError(error, "create");
    }
    const invalid = membershipErrors(input, currencyAllowed);
    if (invalid.length > 0) throw validationException(invalid);
    try {
      const created = await prisma.$transaction(async (tx) => {
        const now = new Date();
        return tx.customer.create({
          data: { ...(await scalarData(tx, input)), createdAt: now, updatedAt: now, createdBy: actorId, updatedBy: actorId, addresses: { create: allAddressRows(input) } },
          select: { id: true, updatedAt: true },
        });
      }, WRITE_TX);
      this.logger.log({
        event: "customer.created", actorId, customerId: created.id,
        invoiceAddressCount: input.invoiceAddresses.length, shippingAddressCount: input.shippingAddresses.length,
      });
      return { id: created.id, updatedAt: created.updatedAt.toISOString() };
    } catch (error) {
      throw mapPersistenceError(error, "create");
    }
  }

  /** Whole replacement with optimistic version (D-05, sequence 4). */
  async update(actorId: string, id: string, body: UpdateCustomerInput) {
    const input = customerInput(body);
    const expected = new Date(body.expectedUpdatedAt);
    try {
      const result = await prisma.$transaction(async (tx) => {
        const stored = await tx.customer.findUnique({ where: { id }, include: { addresses: { select: { countryCode: true } } } });
        if (!stored) throw customerNotFound();
        const currencyAllowed = await isCurrencyAllowed(tx, input.currencyCode, stored.currencyCode);
        const invalid = membershipErrors(input, currencyAllowed, new Set(stored.addresses.map((a) => a.countryCode)));
        if (invalid.length > 0) throw validationException(invalid);

        const data = await scalarData(tx, input);
        // GREATEST(now, expected + 1 ms): the version always moves forward.
        const next = new Date(Math.max(Date.now(), expected.getTime() + 1));
        const updated = await tx.customer.updateMany({ where: { id, updatedAt: expected }, data: { ...data, updatedAt: next, updatedBy: actorId } });
        if (updated.count === 0) {
          const exists = await tx.customer.count({ where: { id } });
          throw exists === 0 ? customerNotFound() : customerStale();
        }
        await tx.customerAddress.deleteMany({ where: { customerId: id } });
        await tx.customerAddress.createMany({ data: allAddressRows(input).map((row) => ({ ...row, customerId: id })) });
        const changedFields = SCALAR_FIELDS.filter((field) => stored[field] !== data[field]);
        return { updatedAt: next, changedFields };
      }, WRITE_TX);
      this.logger.log({
        event: "customer.updated", actorId, customerId: id, changedFields: result.changedFields, addressesReplaced: true,
        invoiceAddressCount: input.invoiceAddresses.length, shippingAddressCount: input.shippingAddresses.length,
      });
      return { id, updatedAt: result.updatedAt.toISOString() };
    } catch (error) {
      throw mapPersistenceError(error, "update");
    }
  }

  /** Hard delete; addresses cascade (D-06). Repeat delete returns 404. */
  async delete(actorId: string, id: string) {
    let count: number;
    try {
      ({ count } = await prisma.customer.deleteMany({ where: { id } }));
    } catch (error) {
      throw mapPersistenceError(error, "delete");
    }
    if (count === 0) throw customerNotFound();
    this.logger.log({ event: "customer.deleted", actorId, customerId: id });
    return { ok: true as const };
  }
}
