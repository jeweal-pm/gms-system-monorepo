"use client";

import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import type { Ref } from "react";
import { Controller, useFormState, useWatch, type UseFormReturn } from "react-hook-form";
import { cx, focusRing } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { LabeledCheckbox } from "@/components/ui/checkbox";
import { TextField } from "@/components/ui/outlined-field";
import { SelectField } from "@/components/ui/select-field";
import { addressArrayName, type AddressType, type CustomerFormValues } from "../schema";
import type { OptionsState } from "./customer-information-card";

type AddressItemProps = {
  form: UseFormReturn<CustomerFormValues>;
  type: AddressType;
  index: number;
  expanded: boolean;
  hasErrors: boolean;
  readOnly: boolean;
  options: OptionsState;
  onToggle: () => void;
  /** Absent for item #1 and in read-only mode. */
  onRemove?: () => void;
  onSetDefault: () => void;
  headerButtonRef?: Ref<HTMLButtonElement>;
};

const typeLabel: Record<AddressType, string> = { invoice: "Invoice address", shipping: "Shipping address" };
/** Autofill sections keep the two address types apart (form-guidelines.md). */
const section: Record<AddressType, string> = { invoice: "billing", shipping: "shipping" };

/**
 * C-11 (FE-CUS-007): one accordion address item. The frame turns red while any field has an
 * error (DV-12), with a "Has errors" tag when collapsed so color is not the only signal (P-07).
 */
export function AddressItem({ form, type, index, expanded, hasErrors, readOnly, options, onToggle, onRemove, onSetDefault, headerButtonRef }: AddressItemProps) {
  const arrayName = addressArrayName[type];
  const base = `${arrayName}.${index}` as const;
  const { control, register } = form;
  const errors = useFormState({ control, name: base }).errors[arrayName]?.[index];
  const [countryCode, isDefault] = useWatch({ control, name: [`${base}.countryCode`, `${base}.isDefault`] });
  const hasCountry = countryCode !== "";
  const title = `${typeLabel[type]} #${index + 1}`;
  const idPrefix = `customer-${type}-${index}`;
  const bodyId = `${idPrefix}-body`;
  const regionPlaceholder = (text: string) => (hasCountry ? text : "Choose a country first");

  return (
    <fieldset className={cx("min-w-0 rounded-gms-md border bg-gms-page", hasErrors ? "border-gms-danger" : "border-gms-border")}>
      <legend className="sr-only">{title}</legend>
      <div className={cx("flex min-h-[46px] items-center justify-between gap-3 pl-2 pr-3", expanded && "border-b border-gms-border")}>
        <button
          ref={headerButtonRef}
          type="button"
          aria-expanded={expanded}
          aria-controls={bodyId}
          aria-label={title}
          onClick={onToggle}
          className={cx("flex min-h-[38px] min-w-0 flex-1 items-center gap-3 rounded-gms-sm px-2 text-left", focusRing)}
        >
          {expanded ? <ChevronDown size={18} className="shrink-0 text-gms-text" aria-hidden /> : <ChevronRight size={18} className="shrink-0 text-gms-text" aria-hidden />}
          <span className="text-[15px] font-semibold text-gms-text">{`#${index + 1}`}</span>
          {hasErrors && !expanded && <span className="text-xs font-medium text-gms-danger">Has errors</span>}
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {isDefault && <Badge variant="default">Default</Badge>}
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove ${typeLabel[type].toLowerCase()} #${index + 1}`}
              title={`Remove ${typeLabel[type].toLowerCase()} #${index + 1}`}
              onClick={onRemove}
              className={cx("inline-flex h-8 w-8 items-center justify-center rounded-gms-sm text-gms-danger hover:bg-gms-danger-subtle", focusRing)}
            >
              <Trash2 size={18} aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div id={bodyId} hidden={!expanded} className="p-4">
        <div className="grid grid-cols-1 items-start gap-4 @min-[28rem]:grid-cols-2">
          <TextField
            id={`${idPrefix}-name`}
            label={type === "invoice" ? "Name/Company Name" : "Name"}
            required
            autoComplete={`${section[type]} ${type === "invoice" ? "organization" : "name"}`}
            readOnly={readOnly}
            error={errors?.name?.message}
            className={type === "shipping" ? "@min-[28rem]:col-span-2" : undefined}
            {...register(`${base}.name`)}
          />
          {type === "invoice" && (
            <TextField id={`${idPrefix}-tax-id`} label="Tax ID" autoComplete="off" readOnly={readOnly} error={errors?.taxId?.message} {...register(`${base}.taxId`)} />
          )}
          <TextField
            id={`${idPrefix}-address`}
            label="Address"
            required
            autoComplete={`${section[type]} street-address`}
            readOnly={readOnly}
            error={errors?.address?.message}
            className="@min-[28rem]:col-span-2"
            {...register(`${base}.address`)}
          />
          <Controller
            control={control}
            name={`${base}.countryCode`}
            render={({ field }) => (
              <SelectField
                id={`${idPrefix}-country`}
                label="Country"
                required
                placeholder="Select country"
                autoComplete={`${section[type]} country`}
                options={options.countries}
                status={options.status}
                onRetry={options.onRetry}
                readOnly={readOnly}
                error={errors?.countryCode?.message}
                ref={field.ref}
                name={field.name}
                value={field.value}
                onChange={(event) => field.onChange(event.target.value)}
                onBlur={field.onBlur}
              />
            )}
          />
          {/* DV-04: free-text State/City, disabled (and skipped by Tab) until a Country is chosen. */}
          <TextField
            id={`${idPrefix}-state`}
            label="State/Province"
            required
            disabled={!hasCountry && !readOnly}
            placeholder={readOnly ? undefined : regionPlaceholder("Enter state or province")}
            autoComplete={`${section[type]} address-level1`}
            readOnly={readOnly}
            error={hasCountry ? errors?.state?.message : undefined}
            {...register(`${base}.state`)}
          />
          <TextField
            id={`${idPrefix}-city`}
            label="City"
            required
            disabled={!hasCountry && !readOnly}
            placeholder={readOnly ? undefined : regionPlaceholder("Enter city")}
            autoComplete={`${section[type]} address-level2`}
            readOnly={readOnly}
            error={hasCountry ? errors?.city?.message : undefined}
            {...register(`${base}.city`)}
          />
          <TextField
            id={`${idPrefix}-postcode`}
            label="Postcode"
            required
            autoComplete={`${section[type]} postal-code`}
            readOnly={readOnly}
            error={errors?.postcode?.message}
            {...register(`${base}.postcode`)}
          />
        </div>
        <div className="mt-5">
          <LabeledCheckbox
            id={`${idPrefix}-default`}
            label="Set as default address"
            checked={isDefault}
            locked={isDefault}
            hint="One address must be the default"
            readOnly={readOnly}
            onChange={(checked) => {
              if (checked) onSetDefault();
            }}
          />
        </div>
      </div>
    </fieldset>
  );
}
