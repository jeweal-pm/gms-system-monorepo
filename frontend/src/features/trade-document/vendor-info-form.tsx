"use client";

import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Field, FormDateInput, FormSelect, TextInput } from "@/features/quotation/components/ui";
import { quotationCurrencyOptions, quotationExchangeRate } from "@/features/quotation/lib/currency";
import { formatDate } from "@/features/quotation/lib/format";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";

/** Header fields every vendor document form has (memo out return, memo return). */
export type VendorHeaderValues = { docDate: string; dueDate: string; vendorId: string; addressId: string; currency: string; exchangeRate: string; ref: string };

/** The vendor part of `*.options` (master `vendorDocumentOptions`). */
export type VendorOptions = {
  vendors: { id: string; code: string; name: string; active: boolean; currency: string | null; addresses: { id: string; label: string; isDefault: boolean }[] }[];
};

/**
 * Header of the vendor documents (memo-out-return source 01, memo-return source 01): Doc Date, Vendor, Address;
 * Due Date, Currency, Exchange Rate (read-only, Setup › Currency) and Ref. Choosing a vendor picks its default
 * address and currency; `onVendorChange` lets a document react too (memo return clears rows of another vendor).
 */
export function VendorDocumentInfoForm({ options, onVendorChange: afterVendorChange }: { options: VendorOptions | undefined; onVendorChange?: (vendorId: string) => void }) {
  const { register, control, setValue, formState: { errors } } = useFormContext<VendorHeaderValues>();
  const vendorId = useWatch({ control, name: "vendorId" });
  const currency = useWatch({ control, name: "currency" }) ?? "";
  const exchangeRate = useWatch({ control, name: "exchangeRate" }) ?? "";
  const currencyOptions = masterTrpc.currency.options.useQuery(undefined, { staleTime: 60_000, retry: retryTransient });
  const items = currencyOptions.data?.items ?? [];
  const baseCode = currencyOptions.data?.baseCode ?? null;
  const vendors = options?.vendors ?? [];
  const vendorOptions = vendors.map((v) => ({ value: v.id, label: `${v.code} · ${v.name}${v.active ? "" : " (inactive)"}` }));
  const addressOptions = (vendors.find((v) => v.id === vendorId)?.addresses ?? []).map((a) => ({ value: a.id, label: a.label }));

  // Owner 2026-10-27: one Exchange Rate per currency, read-only here.
  const onCurrencyChange = (code: string) => setValue("exchangeRate", quotationExchangeRate(items, baseCode, code), { shouldDirty: true });
  const onVendorChange = (id: string) => {
    const vendor = vendors.find((v) => v.id === id);
    const addresses = vendor?.addresses ?? [];
    setValue("addressId", (addresses.find((a) => a.isDefault) ?? addresses[0])?.id ?? "", { shouldDirty: true });
    afterVendorChange?.(id);
    if (vendor?.currency) {
      setValue("currency", vendor.currency, { shouldDirty: true });
      onCurrencyChange(vendor.currency);
    }
  };

  const initialRate = currencyOptions.data ? quotationExchangeRate(items, baseCode, currency) : "";
  useEffect(() => {
    if (exchangeRate === "" && initialRate !== "") setValue("exchangeRate", initialRate, { shouldDirty: false });
  }, [exchangeRate, initialRate, setValue]);

  return (
    <div className="flex flex-col gap-5 px-6 py-6">
      <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-[200px_1fr_1fr]">
        <Field label="Doc Date" required error={errors.docDate?.message}>
          <FormDateInput<VendorHeaderValues> name="docDate" />
        </Field>
        <Field label="Vendor" required error={errors.vendorId?.message}>
          <FormSelect<VendorHeaderValues> name="vendorId" options={vendorOptions} onValueChange={onVendorChange} />
        </Field>
        <Field label="Address" required error={errors.addressId?.message}>
          <FormSelect<VendorHeaderValues> name="addressId" options={addressOptions} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-[200px_1fr_1fr_1fr]">
        <Field label="Due Date" required error={errors.dueDate?.message}>
          <FormDateInput<VendorHeaderValues> name="dueDate" notBefore="docDate" />
        </Field>
        <Field label="Currency" required error={errors.currency?.message}>
          <FormSelect<VendorHeaderValues> name="currency" options={quotationCurrencyOptions(items, currency)} onValueChange={onCurrencyChange} />
        </Field>
        <Field label={baseCode && currency && currency !== baseCode ? `Exchange Rate (1 ${currency} = ? ${baseCode})` : "Exchange Rate"} error={errors.exchangeRate?.message}>
          <TextInput readOnly tabIndex={-1} placeholder="Exchange Rate" {...register("exchangeRate")} />
        </Field>
        <Field label="Ref.">
          <TextInput maxLength={100} {...register("ref")} />
        </Field>
      </div>
    </div>
  );
}

/**
 * A saved vendor document in view mode (memo-return design, view): "<title>" card with Doc Date, Due Date, Vendor,
 * Address, Currency, Exchange Rate and Ref. as text.
 */
export function VendorDocumentDetails({ title, values, options }: { title: string; values: VendorHeaderValues; options: VendorOptions | undefined }) {
  const vendor = options?.vendors.find((v) => v.id === values.vendorId);
  const address = vendor?.addresses.find((a) => a.id === values.addressId);
  const items: [string, string][] = [
    ["Doc Date", values.docDate ? formatDate(values.docDate) : "—"],
    ["Due Date", values.dueDate ? formatDate(values.dueDate) : "—"],
    ["Vendor", vendor ? `${vendor.code} · ${vendor.name}` : "—"],
    ["Address", address?.label ?? "—"],
    ["Currency", values.currency || "—"],
    ["Exchange Rate", values.exchangeRate || "—"],
    ["Ref.", values.ref || "—"],
  ];
  return (
    <section className="mx-6 my-6 rounded-xl border border-[#E3E6EA]" aria-label={title}>
      <h2 className="border-b border-[#E3E6EA] px-5 py-3 text-[15px] font-medium text-[#1C252E]">{title}</h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-4 md:grid-cols-[repeat(2,minmax(0,1fr))_minmax(0,2fr)_minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        {items.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-[#6B7480]">{label}</dt>
            <dd className="mt-1 truncate text-[15px] text-[#1C252E]" title={value}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
