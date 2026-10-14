"use client";

import { Controller, useFormState, type UseFormReturn } from "react-hook-form";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/outlined-field";
import { PhoneField } from "@/components/ui/phone-field";
import { SelectField, type SelectOption } from "@/components/ui/select-field";
import { Switch } from "@/components/ui/switch";
import type { CustomerFormValues } from "../schema";

export type OptionsState = {
  currencies: readonly SelectOption[];
  countries: readonly SelectOption[];
  status: "loading" | "error" | "ready";
  onRetry: () => void;
};

type CustomerInformationCardProps = {
  form: UseFormReturn<CustomerFormValues>;
  readOnly: boolean;
  options: OptionsState;
};

/** 3 columns capped at ~1290 px, left-aligned (S2); 2 / 1 columns on narrower content (Q-CUS-05). */
const grid = "grid max-w-[1290px] grid-cols-1 items-start gap-x-[17px] gap-y-5 @min-[40rem]:grid-cols-2 @min-[66rem]:grid-cols-3";

/** C-05..C-09 (FE-CUS-006): Customer Information card with the Active switch in the header. */
export function CustomerInformationCard({ form, readOnly, options }: CustomerInformationCardProps) {
  const { control, register } = form;
  const { errors } = useFormState({ control });

  return (
    <Card
      title="Customer Information"
      titleId="customer-information-title"
      titleClassName="text-lg font-medium text-gms-text"
      headerClassName="min-h-[65px]"
      bodyClassName="@container lg:px-[39px]"
      trailing={
        <Controller
          control={control}
          name="active"
          render={({ field }) => <Switch id="customer-active" label="Active" checked={field.value} onChange={field.onChange} readOnly={readOnly} />}
        />
      }
    >
      <div className={grid}>
        <TextField id="customer-code" label="Code Name" autoComplete="off" readOnly={readOnly} error={errors.code?.message} {...register("code")} />
        <TextField id="customer-name" label="Name" required autoComplete="organization" readOnly={readOnly} error={errors.name?.message} {...register("name")} />
        <Controller
          control={control}
          name="currencyCode"
          render={({ field }) => (
            <SelectField
              id="customer-currency"
              label="Currency"
              required
              placeholder="Select currency"
              options={options.currencies}
              status={options.status}
              onRetry={options.onRetry}
              readOnly={readOnly}
              error={errors.currencyCode?.message}
              ref={field.ref}
              name={field.name}
              value={field.value}
              onChange={(event) => field.onChange(event.target.value)}
              onBlur={field.onBlur}
            />
          )}
        />
      </div>

      <h3 className="mb-5 mt-6 text-sm font-medium text-gms-text">Basic Information</h3>
      <div className={grid}>
        <TextField id="customer-first-name" label="First name" required autoComplete="given-name" readOnly={readOnly} error={errors.firstName?.message} {...register("firstName")} />
        <TextField id="customer-middle-name" label="Middle name" autoComplete="additional-name" readOnly={readOnly} error={errors.middleName?.message} {...register("middleName")} />
        <TextField id="customer-last-name" label="Last name" autoComplete="family-name" readOnly={readOnly} error={errors.lastName?.message} {...register("lastName")} />
        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <PhoneField
              id="customer-phone"
              label="Phone No."
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              inputRef={field.ref}
              readOnly={readOnly}
              error={errors.phone?.number?.message ?? errors.phone?.message}
            />
          )}
        />
        <TextField
          id="customer-email"
          label="Email"
          required
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="name@company.com"
          spellCheck={false}
          autoCapitalize="none"
          readOnly={readOnly}
          error={errors.email?.message}
          {...register("email")}
        />
      </div>
    </Card>
  );
}
