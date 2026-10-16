"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { PartnerEntity } from "../entity";
import styles from "./partner-print.module.css";

/** Saved address as returned by a partner `get` (Tax ID only on invoice addresses). */
export type PrintAddress = {
  id: string;
  position: number;
  name: string;
  taxId?: string | null;
  address: string;
  countryCode: string;
  state: string;
  city: string;
  postcode: string;
  isDefault: boolean;
};

/** Saved partner fields shown in the information section. */
export type PrintPartner = {
  name: string;
  code: string | null;
  currencyCode: string;
  active: boolean;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  phone: { e164: string } | null;
  email: string;
};

export type PrintAddressSection = { title: string; nameLabel: string; withTaxId: boolean; addresses: readonly PrintAddress[] };

type PartnerPrintViewProps = {
  entity: PartnerEntity;
  /** The saved record as last loaded (never unsaved form edits, P-03). */
  partner: PrintPartner;
  addressSections: readonly PrintAddressSection[];
  currencyLabel: (code: string) => string;
  countryLabel: (code: string) => string;
  /** Print timestamp, formatted by the page right before printing (after mount). */
  printedAt: string;
};

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 py-1 text-gms-body">
      <dt className="font-semibold">{label}</dt>
      <dd>{value && value.trim() !== "" ? value : "-"}</dd>
    </div>
  );
}

function AddressBlock({ section, countryLabel }: { section: PrintAddressSection; countryLabel: (code: string) => string }) {
  return (
    <section className="mt-6 break-inside-avoid-page">
      <h2 className="border-b border-black pb-1 text-gms-heading font-semibold">{`${section.title} (${section.addresses.length})`}</h2>
      {[...section.addresses]
        .sort((a, b) => a.position - b.position)
        .map((address) => (
          <div key={address.id} className="mt-3 break-inside-avoid">
            <h3 className="text-gms-body font-semibold">{`#${address.position}${address.isDefault ? " (Default)" : ""}`}</h3>
            <dl>
              <Row label={section.nameLabel} value={address.name} />
              {section.withTaxId && <Row label="Tax ID" value={address.taxId} />}
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
 * Partner C-13 (customer FE-CUS-013, vendor FE-VEN-009): print-only layout of the saved record with
 * every address expanded. Rendered into <body> through a portal so print CSS can hide the whole AppShell.
 */
export function PartnerPrintView({ entity, partner, addressSections, currencyLabel, countryLabel, printedAt }: PartnerPrintViewProps) {
  useEffect(() => {
    document.body.classList.add(styles.printScope);
    return () => document.body.classList.remove(styles.printScope);
  }, []);

  const contactName = [partner.firstName, partner.middleName, partner.lastName].filter(Boolean).join(" ");

  return createPortal(
    <div className={`${styles.printRoot} bg-white p-8 text-black`}>
      <header className="flex items-baseline justify-between border-b-2 border-black pb-2">
        <h1 className="text-gms-title font-semibold">{`${entity.singular} ${partner.name}`}</h1>
        <p className="text-gms-label">{printedAt ? `Printed ${printedAt}` : ""}</p>
      </header>
      <section className="mt-4">
        <h2 className="border-b border-black pb-1 text-gms-heading font-semibold">{`${entity.singular} Information`}</h2>
        <dl className="mt-2">
          <Row label="Code Name" value={partner.code} />
          <Row label="Name" value={partner.name} />
          <Row label="Currency" value={currencyLabel(partner.currencyCode)} />
          <Row label="Status" value={partner.active ? "Active" : "Inactive"} />
          <Row label="Contact" value={contactName} />
          <Row label="Phone No." value={partner.phone?.e164} />
          <Row label="Email" value={partner.email} />
        </dl>
      </section>
      {addressSections.map((section) => (
        <AddressBlock key={section.title} section={section} countryLabel={countryLabel} />
      ))}
    </div>,
    document.body,
  );
}
