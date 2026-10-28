"use client";

import { useEffect, type ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Field, FormSelect, TextInput } from "@/features/quotation/components/ui";
import { quotationCurrencyOptions, quotationExchangeRate } from "@/features/quotation/lib/currency";
import { masterLoadMessage, useCurrencyOptions, useFetchVendor, useVendor, useVendorChoices } from "../api";
import { MAX_REF, type MemoReceiveFormValues } from "../schema";

/**
 * Header fields (ui-spec I-01…I-07): vendors and their addresses from Setup › Vendor, currencies and rates
 * from Setup › Currency. Choosing a vendor picks its default address and currency (Q-MR-06).
 */
export function MemoReceiveInfoForm() {
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = useFormContext<MemoReceiveFormValues>();
  const vendorId = useWatch({ control, name: "vendorId" }) ?? "";
  const currency = useWatch({ control, name: "currency" }) ?? "";
  const exchangeRate = useWatch({ control, name: "exchangeRate" }) ?? "";

  const vendors = useVendorChoices();
  const vendor = useVendor(vendorId);
  const fetchVendor = useFetchVendor();
  const currencies = useCurrencyOptions();
  const items = currencies.data?.items ?? [];
  const baseCode = currencies.data?.baseCode ?? null;

  // The chosen vendor stays listed even when it is past the first page or inactive.
  const vendorOptions = (vendors.data ?? []).map((v) => ({ value: v.id, label: v.label }));
  if (vendor.data && !vendorOptions.some((option) => option.value === vendor.data.id)) vendorOptions.unshift({ value: vendor.data.id, label: vendor.data.label });
  const addressOptions = (vendor.data?.addresses ?? []).map((a) => ({ value: a.id, label: a.label }));

  const onCurrencyChange = (code: string) => setValue("exchangeRate", quotationExchangeRate(items, baseCode, code), { shouldDirty: true });

  const onVendorChange = async (id: string) => {
    setValue("addressId", "", { shouldDirty: true });
    try {
      const picked = await fetchVendor(id);
      const address = picked.invoiceAddresses.find((a) => a.isDefault) ?? picked.invoiceAddresses[0];
      setValue("addressId", address?.id ?? "", { shouldDirty: true });
      if (picked.currencyCode) {
        setValue("currency", picked.currencyCode, { shouldDirty: true });
        onCurrencyChange(picked.currencyCode);
      }
    } catch {
      // The Address field shows the vendor's load error.
    }
  };

  // A new document starts in the company currency, and its rate fills once the currency list arrives.
  useEffect(() => {
    if (currency === "" && baseCode) setValue("currency", baseCode);
  }, [currency, baseCode, setValue]);
  const initialRate = currencies.data ? quotationExchangeRate(items, baseCode, currency) : "";
  useEffect(() => {
    if (exchangeRate === "" && initialRate !== "") setValue("exchangeRate", initialRate, { shouldDirty: false });
  }, [exchangeRate, initialRate, setValue]);

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-5 px-6 py-6 md:grid-cols-[200px_1fr_1fr_1fr]">
      <Field label="Doc Date" required error={errors.docDate?.message}>
        <TextInput type="date" {...register("docDate")} />
      </Field>
      <LoadNote message={vendors.error ? masterLoadMessage(vendors.error, "vendors") : undefined}>
        <Field label="Vendor" required error={errors.vendorId?.message}>
          <FormSelect<MemoReceiveFormValues> name="vendorId" options={vendorOptions} onValueChange={(id) => void onVendorChange(id)} />
        </Field>
      </LoadNote>
      <LoadNote message={vendor.error ? masterLoadMessage(vendor.error, "this vendor's addresses") : undefined} className="md:col-span-2">
        <Field label="Address" required error={errors.addressId?.message}>
          <FormSelect<MemoReceiveFormValues> name="addressId" options={addressOptions} disabled={!vendorId} />
        </Field>
      </LoadNote>

      <Field label="Due Date" required error={errors.dueDate?.message}>
        <TextInput type="date" {...register("dueDate")} />
      </Field>
      <LoadNote message={currencies.error ? masterLoadMessage(currencies.error, "currencies") : undefined}>
        <Field label="Currency" required error={errors.currency?.message}>
          <FormSelect<MemoReceiveFormValues> name="currency" options={quotationCurrencyOptions(items, currency)} onValueChange={onCurrencyChange} />
        </Field>
      </LoadNote>
      <Field label={baseCode && currency && currency !== baseCode ? `Exchange Rate (1 ${currency} = ? ${baseCode})` : "Exchange Rate"}>
        <TextInput readOnly tabIndex={-1} placeholder="Exchange Rate" {...register("exchangeRate")} />
      </Field>
      <Field label="Ref." error={errors.ref?.message}>
        <TextInput maxLength={MAX_REF} {...register("ref")} />
      </Field>
    </div>
  );
}

function LoadNote({ message, className, children }: { message?: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      {children}
      {message && <p role="alert" className="mt-1 pl-4 text-xs text-[#E5484D]">{message}</p>}
    </div>
  );
}
