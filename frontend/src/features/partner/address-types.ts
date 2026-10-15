import type { AddressArrayName } from "./schema";

/** One address type of a Partner Master entity (vendor FE-VEN-001). */
export type AddressTypeConfig = {
  /** "invoice" / "shipping": ids, "Add another {key} address", "Up to 10 {key} addresses". */
  key: "invoice" | "shipping";
  arrayName: AddressArrayName;
  /** Card title, e.g. "Invoice Address". */
  title: string;
  /** Item legend / aria prefix, e.g. "Invoice address" (+ " #n"). */
  itemLabel: string;
  /** Visible label of the item name field. */
  nameLabel: string;
  /** Autofill token of the name field (inside the autofill section). */
  nameAutoComplete: "organization" | "name";
  /** Autofill section that keeps address types apart (form-guidelines.md). */
  autofillSection: "billing" | "shipping";
  withTaxId: boolean;
};

export const invoiceAddressType: AddressTypeConfig = {
  key: "invoice",
  arrayName: "invoiceAddresses",
  title: "Invoice Address",
  itemLabel: "Invoice address",
  nameLabel: "Name/Company Name",
  nameAutoComplete: "organization",
  autofillSection: "billing",
  withTaxId: true,
};

export const shippingAddressType: AddressTypeConfig = {
  key: "shipping",
  arrayName: "shippingAddresses",
  title: "Shipping Address",
  itemLabel: "Shipping address",
  nameLabel: "Name",
  nameAutoComplete: "name",
  autofillSection: "shipping",
  withTaxId: false,
};
