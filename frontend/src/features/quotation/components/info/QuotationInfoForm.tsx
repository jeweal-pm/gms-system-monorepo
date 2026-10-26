"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { useOptions } from "../../options-context";
import type { QuotationFormValues } from "../../schema";
import { Field, FormSelect, NumberInput, TextInput } from "../ui";

/** Header fields (ADR-0025 §1) with customers, addresses and currencies from `quotation.options` (SA-QT-06). */
export function QuotationInfoForm() {
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = useFormContext<QuotationFormValues>();
  const options = useOptions();
  const customerId = useWatch({ control, name: "customerId" });
  const currency = useWatch({ control, name: "currency" });
  const customers = options?.customers ?? [];
  const customerOptions = customers.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}${c.active ? "" : " (inactive)"}` }));
  const addresses = customers.find((c) => c.id === customerId)?.addresses ?? [];
  const shippingOptions = addresses.filter((a) => a.type === "SHIPPING").map((a) => ({ value: a.id, label: a.label }));
  const invoiceOptions = addresses.filter((a) => a.type === "INVOICE").map((a) => ({ value: a.id, label: a.label }));
  const currencyOptions = (options?.currencies ?? []).map((code) => ({ value: code, label: code }));
  // A foreign currency needs a rate to the company currency (SA-QT-06; stored for reference, Q-QT-01).
  const rateRequired = Boolean(options?.companyCurrency && currency && currency !== options.companyCurrency);

  // Changing the customer picks its default addresses and currency (ADR-0025 open question 8).
  const onCustomerChange = (id: string) => {
    const customer = customers.find((c) => c.id === id);
    const pick = (type: "SHIPPING" | "INVOICE") => {
      const list = customer?.addresses.filter((a) => a.type === type) ?? [];
      return (list.find((a) => a.isDefault) ?? list[0])?.id ?? "";
    };
    setValue("shippingAddressId", pick("SHIPPING"), { shouldDirty: true });
    setValue("invoiceAddressId", pick("INVOICE"), { shouldDirty: true });
    if (customer?.currency) setValue("currency", customer.currency, { shouldDirty: true });
  };

  const onCurrencyChange = (code: string) => {
    if (code === options?.companyCurrency) setValue("exchangeRate", "", { shouldDirty: true });
  };

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-5 px-6 py-6 md:grid-cols-[200px_1fr_1fr_1fr]">
      <Field label="Doc Date" required error={errors.docDate?.message}>
        <TextInput type="date" {...register("docDate")} />
      </Field>
      <Field label="Customer" required error={errors.customerId?.message}>
        <FormSelect<QuotationFormValues> name="customerId" options={customerOptions} onValueChange={onCustomerChange} />
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
        <FormSelect<QuotationFormValues> name="currency" options={currencyOptions} onValueChange={onCurrencyChange} />
      </Field>
      <Field label={options?.companyCurrency ? `Exchange Rate (1 ${currency || "…"} = ? ${options.companyCurrency})` : "Exchange Rate"} required={rateRequired} error={errors.exchangeRate?.message}>
        <NumberInput decimals={6} placeholder={rateRequired ? "Required" : "Not needed"} readOnly={!rateRequired} {...register("exchangeRate")} />
      </Field>
      <Field label="Ref.">
        <TextInput maxLength={100} {...register("ref")} />
      </Field>
    </div>
  );
}
