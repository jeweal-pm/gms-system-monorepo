"use client";

import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import type { Ref } from "react";
import { Controller, useFormState, useWatch, type FieldValues, type UseFormReturn } from "react-hook-form";
import { cx, focusRing } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { LabeledCheckbox } from "@/components/ui/checkbox";
import { TextField } from "@/components/ui/outlined-field";
import { SelectField } from "@/components/ui/select-field";
import type { AddressTypeConfig } from "../address-types";
import type { OptionsState } from "../options";
import type { AddressFormValue, AddressArrayName, DefaultRule, PartnerAddressValues } from "../schema";

/**
 * Item body grid.
 * - `split` (customer): 2 columns on a half-width card.
 * - `wide` (vendor VD-03): 4 columns capped at ~1220 px, left-aligned, inside a full-width card;
 *   2 columns below ~900 px and 1 column below ~600 px of card width (container query).
 */
export type AddressLayout = "split" | "wide";

/** Internal view of the form: only the configured address array is touched. */
type AddressForm = Record<AddressArrayName, AddressFormValue[]>;

type AddressItemProps<TForm extends FieldValues & PartnerAddressValues> = {
  form: UseFormReturn<TForm>;
  type: AddressTypeConfig;
  /** DOM id prefix, e.g. "customer" -> "customer-invoice-0-name". */
  idPrefix: string;
  layout: AddressLayout;
  defaultRule: DefaultRule;
  index: number;
  expanded: boolean;
  hasErrors: boolean;
  readOnly: boolean;
  options: OptionsState;
  onToggle: () => void;
  /** Absent for item #1 and in read-only mode. */
  onRemove?: () => void;
  onDefaultChange: (checked: boolean) => void;
  headerButtonRef?: Ref<HTMLButtonElement>;
};

const gridClass: Record<AddressLayout, string> = {
  split: "grid grid-cols-1 items-start gap-4 @min-[28rem]:grid-cols-2",
  wide: "grid max-w-[1220px] grid-cols-1 items-start gap-x-[17px] gap-y-5 @min-[600px]:grid-cols-2 @min-[900px]:grid-cols-4",
};

/** Column spans per layout. `split` keeps the customer classes unchanged. */
function spans(layout: AddressLayout, withTaxId: boolean) {
  if (layout === "split") {
    return {
      name: withTaxId ? undefined : "@min-[28rem]:col-span-2",
      address: "@min-[28rem]:col-span-2",
      half: undefined,
    };
  }
  return {
    name: withTaxId ? undefined : "@min-[600px]:col-span-2",
    address: "@min-[600px]:col-span-2 @min-[900px]:col-span-4",
    half: "@min-[900px]:col-span-2",
  };
}

/**
 * Partner C-10 (customer FE-CUS-007, vendor FE-VEN-006): one accordion address item. The frame
 * turns red while any field has an error (DV-12), with a "Has errors" tag when collapsed so color
 * is not the only signal (P-07).
 */
export function AddressItem<TForm extends FieldValues & PartnerAddressValues>({
  form,
  type,
  idPrefix,
  layout,
  defaultRule,
  index,
  expanded,
  hasErrors,
  readOnly,
  options,
  onToggle,
  onRemove,
  onDefaultChange,
  headerButtonRef,
}: AddressItemProps<TForm>) {
  const { control, register } = form as unknown as UseFormReturn<AddressForm>;
  const arrayName = type.arrayName;
  const base = `${arrayName}.${index}` as const;
  const errors = useFormState({ control, name: base }).errors[arrayName]?.[index];
  const [countryCode, isDefault] = useWatch({ control, name: [`${base}.countryCode`, `${base}.isDefault`] });
  const hasCountry = countryCode !== "";
  const title = `${type.itemLabel} #${index + 1}`;
  const itemId = `${idPrefix}-${type.key}-${index}`;
  const bodyId = `${itemId}-body`;
  const section = type.autofillSection;
  const span = spans(layout, type.withTaxId);
  const regionPlaceholder = (text: string) => (hasCountry ? text : "Choose a country first");
  const locked = defaultRule === "exactlyOne" && isDefault;

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
              aria-label={`Remove ${type.itemLabel.toLowerCase()} #${index + 1}`}
              title={`Remove ${type.itemLabel.toLowerCase()} #${index + 1}`}
              onClick={onRemove}
              className={cx("inline-flex h-8 w-8 items-center justify-center rounded-gms-sm text-gms-danger hover:bg-gms-danger-subtle", focusRing)}
            >
              <Trash2 size={18} aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div id={bodyId} hidden={!expanded} className="p-4">
        <div className={gridClass[layout]}>
          <TextField
            id={`${itemId}-name`}
            label={type.nameLabel}
            required
            autoComplete={`${section} ${type.nameAutoComplete}`}
            readOnly={readOnly}
            error={errors?.name?.message}
            className={span.name}
            {...register(`${base}.name`)}
          />
          {type.withTaxId && (
            <TextField id={`${itemId}-tax-id`} label="Tax ID" autoComplete="off" readOnly={readOnly} error={errors?.taxId?.message} {...register(`${base}.taxId`)} />
          )}
          <TextField
            id={`${itemId}-address`}
            label="Address"
            required
            autoComplete={`${section} street-address`}
            readOnly={readOnly}
            error={errors?.address?.message}
            className={span.address}
            {...register(`${base}.address`)}
          />
          <Controller
            control={control}
            name={`${base}.countryCode`}
            render={({ field }) => (
              <SelectField
                id={`${itemId}-country`}
                label="Country"
                required
                placeholder="Select country"
                autoComplete={`${section} country`}
                options={options.countries}
                status={options.status}
                onRetry={options.onRetry}
                readOnly={readOnly}
                error={errors?.countryCode?.message}
                className={span.half}
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
            id={`${itemId}-state`}
            label="State/Province"
            required
            disabled={!hasCountry && !readOnly}
            placeholder={readOnly ? undefined : regionPlaceholder("Enter state or province")}
            autoComplete={`${section} address-level1`}
            readOnly={readOnly}
            error={hasCountry ? errors?.state?.message : undefined}
            className={span.half}
            {...register(`${base}.state`)}
          />
          <TextField
            id={`${itemId}-city`}
            label="City"
            required
            disabled={!hasCountry && !readOnly}
            placeholder={readOnly ? undefined : regionPlaceholder("Enter city")}
            autoComplete={`${section} address-level2`}
            readOnly={readOnly}
            error={hasCountry ? errors?.city?.message : undefined}
            className={span.half}
            {...register(`${base}.city`)}
          />
          <TextField
            id={`${itemId}-postcode`}
            label="Postcode"
            required
            autoComplete={`${section} postal-code`}
            readOnly={readOnly}
            error={errors?.postcode?.message}
            className={span.half}
            {...register(`${base}.postcode`)}
          />
        </div>
        <div className="mt-5">
          <LabeledCheckbox
            id={`${itemId}-default`}
            label="Set as default address"
            checked={isDefault}
            locked={locked}
            hint={defaultRule === "exactlyOne" ? "One address must be the default" : undefined}
            readOnly={readOnly}
            onChange={onDefaultChange}
          />
        </div>
      </div>
    </fieldset>
  );
}
