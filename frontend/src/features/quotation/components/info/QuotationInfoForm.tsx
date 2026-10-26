"use client";

import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";
import { quotationCurrencyOptions, quotationExchangeRate } from "../../lib/currency";
import { customers } from "../../mock/masters";
import type { QuotationFormValues } from "../../schema";
import { Field, FormSelect, TextInput } from "../ui";

export function QuotationInfoForm() {
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = useFormContext<QuotationFormValues>();
  const customerId = useWatch({ control, name: "customerId" });
  const currency = useWatch({ control, name: "currency" }) ?? "";
  const exchangeRate = useWatch({ control, name: "exchangeRate" }) ?? "";
  // Setup › Currency (currency UI rev 1): readable with quotation:VIEW.
  const currencyOptions = masterTrpc.currency.options.useQuery(undefined, { staleTime: 60_000, retry: retryTransient });
  const items = currencyOptions.data?.items ?? [];
  const baseCode = currencyOptions.data?.baseCode ?? null;
  const addresses = customers.find((c) => c.value === customerId)?.addresses ?? [];
  const shippingOptions = addresses.filter((a) => a.kind !== "INVOICE");
  const invoiceOptions = addresses.filter((a) => a.kind !== "SHIPPING");

  // เปลี่ยนลูกค้า → เลือกที่อยู่แรกให้อัตโนมัติ (Open Question #8)
  const onCustomerChange = (id: string) => {
    const next = customers.find((c) => c.value === id)?.addresses ?? [];
    setValue("shippingAddressId", next.find((a) => a.kind !== "INVOICE")?.value ?? "", { shouldDirty: true });
    setValue("invoiceAddressId", next.find((a) => a.kind !== "SHIPPING")?.value ?? "", { shouldDirty: true });
  };

  // Exchange Rate = the currency's Selling Rate (Q-CUR-07); the base currency leaves it empty.
  const onCurrencyChange = (code: string) => {
    setValue("exchangeRate", quotationExchangeRate(items, baseCode, code), { shouldDirty: true });
  };

  // A new quotation starts with a currency but no rate: fill it once the currency list arrives.
  const initialRate = currencyOptions.data ? quotationExchangeRate(currencyOptions.data.items, currencyOptions.data.baseCode, currency) : "";
  useEffect(() => {
    if (exchangeRate === "" && initialRate !== "") setValue("exchangeRate", initialRate, { shouldDirty: false });
  }, [exchangeRate, initialRate, setValue]);

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-5 px-6 py-6 md:grid-cols-[200px_1fr_1fr_1fr]">
      <Field label="Doc Date" required error={errors.docDate?.message}>
        <TextInput type="date" {...register("docDate")} />
      </Field>
      <Field label="Customer" required error={errors.customerId?.message}>
        <FormSelect<QuotationFormValues> name="customerId" options={customers} onValueChange={onCustomerChange} />
      </Field>
      <Field label="Shipping Address" required error={errors.shippingAddressId?.message}>
        <FormSelect<QuotationFormValues> name="shippingAddressId" options={shippingOptions} />
      </Field>
      <Field label="Invoice Address" required error={errors.invoiceAddressId?.message}>
        <FormSelect<QuotationFormValues> name="invoiceAddressId" options={invoiceOptions} />
      </Field>

      <Field label="Due Date" required error={errors.dueDate?.message}>
        <TextInput type="date" {...register("dueDate")} />
      </Field>
      <Field label="Currency" required error={errors.currency?.message}>
        <FormSelect<QuotationFormValues> name="currency" options={quotationCurrencyOptions(items, currency)} onValueChange={onCurrencyChange} />
      </Field>
      <Field label="Exchange Rate">
        <TextInput readOnly tabIndex={-1} placeholder="Exchange Rate" {...register("exchangeRate")} />
      </Field>
      <Field label="Ref.">
        <TextInput maxLength={50} {...register("ref")} />
      </Field>
    </div>
  );
}
