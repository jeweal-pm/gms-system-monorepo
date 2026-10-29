"use client";

import { useEffect, type ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Field, FormSelect, TextInput } from "@/features/quotation/components/ui";
import { quotationCurrencyOptions, quotationExchangeRate } from "@/features/quotation/lib/currency";
import { memoReceiveLoadError, useCurrencyRates, type MemoReceiveOptions } from "../api";
import { MAX_REF, type MemoReceiveFormValues } from "../schema";

/**
 * Header fields (ui-spec I-01…I-07): vendors and their addresses from `memoReceive.options` (rev 3), exchange rates
 * from Setup › Currency. Choosing a vendor picks its default address and currency (Q-MR-06).
 */
export function MemoReceiveInfoForm({ options, optionsError }: { options: MemoReceiveOptions | undefined; optionsError?: unknown }) {
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = useFormContext<MemoReceiveFormValues>();
  const vendorId = useWatch({ control, name: "vendorId" }) ?? "";
  const currency = useWatch({ control, name: "currency" }) ?? "";
  const exchangeRate = useWatch({ control, name: "exchangeRate" }) ?? "";

  const rates = useCurrencyRates();
  const items = rates.data?.items ?? [];
  const baseCode = rates.data?.baseCode ?? options?.companyCurrency ?? null;

  const vendors = options?.vendors ?? [];
  const vendorOptions = vendors.map((v) => ({ value: v.id, label: `${v.code ? `${v.code} · ` : ""}${v.name}${v.active ? "" : " (inactive)"}` }));
  const addressOptions = (vendors.find((v) => v.id === vendorId)?.addresses ?? []).map((a) => ({ value: a.id, label: a.label }));

  const onCurrencyChange = (code: string) => setValue("exchangeRate", quotationExchangeRate(items, baseCode, code), { shouldDirty: true });

  const onVendorChange = (id: string) => {
    const vendor = vendors.find((v) => v.id === id);
    const addresses = vendor?.addresses ?? [];
    setValue("addressId", (addresses.find((a) => a.isDefault) ?? addresses[0])?.id ?? "", { shouldDirty: true });
    if (vendor?.currency) {
      setValue("currency", vendor.currency, { shouldDirty: true });
      onCurrencyChange(vendor.currency);
    }
  };

  // A new document starts in the company currency, and its rate fills once the currency list arrives.
  useEffect(() => {
    if (currency === "" && baseCode) setValue("currency", baseCode);
  }, [currency, baseCode, setValue]);
  const initialRate = rates.data ? quotationExchangeRate(items, baseCode, currency) : "";
  useEffect(() => {
    if (exchangeRate === "" && initialRate !== "") setValue("exchangeRate", initialRate, { shouldDirty: false });
  }, [exchangeRate, initialRate, setValue]);

  const optionsMessage = optionsError ? memoReceiveLoadError(optionsError, "vendors") : undefined;

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-5 px-6 py-6 md:grid-cols-[200px_1fr_1fr_1fr]">
      <Field label="Doc Date" required error={errors.docDate?.message}>
        <TextInput type="date" {...register("docDate")} />
      </Field>
      <LoadNote message={optionsMessage}>
        <Field label="Vendor" required error={errors.vendorId?.message}>
          <FormSelect<MemoReceiveFormValues> name="vendorId" options={vendorOptions} onValueChange={onVendorChange} />
        </Field>
      </LoadNote>
      <div className="md:col-span-2">
        <Field label="Address" required error={errors.addressId?.message}>
          <FormSelect<MemoReceiveFormValues> name="addressId" options={addressOptions} disabled={!vendorId} />
        </Field>
      </div>

      <Field label="Due Date" required error={errors.dueDate?.message}>
        <TextInput type="date" {...register("dueDate")} />
      </Field>
      <LoadNote message={rates.error ? memoReceiveLoadError(rates.error, "currencies") : undefined}>
        <Field label="Currency" required error={errors.currency?.message}>
          <FormSelect<MemoReceiveFormValues> name="currency" options={quotationCurrencyOptions(items, currency)} onValueChange={onCurrencyChange} />
        </Field>
      </LoadNote>
      <Field label={baseCode && currency && currency !== baseCode ? `Exchange Rate (1 ${currency} = ? ${baseCode})` : "Exchange Rate"} error={errors.exchangeRate?.message}>
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
