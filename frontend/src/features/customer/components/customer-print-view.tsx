"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { CustomerDetail } from "../contract";
import styles from "./customer-print.module.css";

type CustomerPrintViewProps = {
  /** The saved customer as last loaded (never unsaved form edits, P-03). */
  customer: CustomerDetail;
  currencyLabel: (code: string) => string;
  countryLabel: (code: string) => string;
  /** Print timestamp, formatted by the page right before printing (after mount). */
  printedAt: string;
};

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 py-1 text-sm">
      <dt className="font-semibold">{label}</dt>
      <dd>{value && value.trim() !== "" ? value : "-"}</dd>
    </div>
  );
}

type PrintAddress = CustomerDetail["shippingAddresses"][number] & { taxId?: string | null };

function AddressBlock({ title, addresses, withTaxId, countryLabel }: { title: string; addresses: PrintAddress[]; withTaxId: boolean; countryLabel: (code: string) => string }) {
  return (
    <section className="mt-6 break-inside-avoid-page">
      <h2 className="border-b border-black pb-1 text-base font-semibold">{`${title} (${addresses.length})`}</h2>
      {[...addresses]
        .sort((a, b) => a.position - b.position)
        .map((address) => (
          <div key={address.id} className="mt-3 break-inside-avoid">
            <h3 className="text-sm font-semibold">{`#${address.position}${address.isDefault ? " (Default)" : ""}`}</h3>
            <dl>
              <Row label={withTaxId ? "Name/Company Name" : "Name"} value={address.name} />
              {withTaxId && <Row label="Tax ID" value={address.taxId} />}
              <Row label="Address" value={address.address} />
              <Row label="Country" value={countryLabel(address.countryCode)} />
              <Row label="State/Province" value={address.state} />
              <Row label="City" value={address.city} />
              <Row label="Postcode" value={address.postcode} />
            </dl>
          </div>
        ))}
    </section>
  );
}

/**
 * C-20 (FE-CUS-013): print-only layout of the saved customer with every address expanded.
 * Rendered into <body> through a portal so print CSS can hide the whole AppShell.
 */
export function CustomerPrintView({ customer, currencyLabel, countryLabel, printedAt }: CustomerPrintViewProps) {
  useEffect(() => {
    document.body.classList.add(styles.printScope);
    return () => document.body.classList.remove(styles.printScope);
  }, []);

  const contactName = [customer.firstName, customer.middleName, customer.lastName].filter(Boolean).join(" ");

  return createPortal(
    <div className={`${styles.printRoot} bg-white p-8 text-black`}>
      <header className="flex items-baseline justify-between border-b-2 border-black pb-2">
        <h1 className="text-xl font-semibold">{`Customer ${customer.name}`}</h1>
        <p className="text-xs">{printedAt ? `Printed ${printedAt}` : ""}</p>
      </header>
      <section className="mt-4">
        <h2 className="border-b border-black pb-1 text-base font-semibold">Customer Information</h2>
        <dl className="mt-2">
          <Row label="Code Name" value={customer.code} />
          <Row label="Name" value={customer.name} />
          <Row label="Currency" value={currencyLabel(customer.currencyCode)} />
          <Row label="Status" value={customer.active ? "Active" : "Inactive"} />
          <Row label="Contact" value={contactName} />
          <Row label="Phone No." value={customer.phone?.e164} />
          <Row label="Email" value={customer.email} />
        </dl>
      </section>
      <AddressBlock title="Invoice Address" addresses={customer.invoiceAddresses} withTaxId countryLabel={countryLabel} />
      <AddressBlock title="Shipping Address" addresses={customer.shippingAddresses} withTaxId={false} countryLabel={countryLabel} />
    </div>,
    document.body,
  );
}
