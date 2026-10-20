"use client";

import { Trash2 } from "lucide-react";
import type { Ref } from "react";
import { Controller, useFormState, useWatch, type FieldValues, type UseFormReturn } from "react-hook-form";
import { cx, focusRing } from "@/components/ui/button";
import { LabeledCheckbox } from "@/components/ui/checkbox";
import { TextField } from "@/components/ui/outlined-field";
import { ComboboxField } from "@/components/ui/combobox-field";
import { useRegionData } from "@/lib/regions";
import type { AddressTypeConfig } from "../address-types";
import type { OptionsState } from "../options";
import type { AddressFormValue, AddressArrayName, DefaultRule, PartnerAddressValues } from "../schema";
import { RegionField, type RegionValue } from "./region-field";

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
  hasErrors: boolean;
  readOnly: boolean;
  options: OptionsState;
  /** Asks to remove the item (the list confirms first). Absent when it is the only item; the default item also renders the trash icon disabled. */
  onRemove?: () => void;
  onDefaultChange: (checked: boolean) => void;
  /** The "Set as default address" checkbox; the list focuses it after the next item is removed. */
  defaultInputRef?: Ref<HTMLInputElement>;
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
 * Whether an address card's trash icon is enabled, and why not (owner 2026-10-19): any item can be
 * removed except the default address and the last remaining one (the schema needs at least one);
 * read-only view disables it without a hint.
 */
export function addressRemoval({ isOnly, isDefault, readOnly, itemLabel }: { isOnly: boolean; isDefault: boolean; readOnly: boolean; itemLabel: string }) {
  if (readOnly) return { canRemove: false, hint: undefined };
  const label = itemLabel.toLowerCase();
  if (isDefault) return { canRemove: false, hint: `The default ${label} cannot be removed` };
  if (isOnly) return { canRemove: false, hint: `At least one ${label} is required` };
  return { canRemove: true, hint: undefined };
}

/**
 * Partner C-10 (customer FE-CUS-007 / rev 3 FE-CUS-R3-002, vendor FE-VEN-006 / rev 4 FE-VEN-R4-002):
 * one address card. Rev 3/4 design: the "#N" label sits outside the card on the left; the light gray,
 * rounded card has no collapse chevron and no "Default" badge. Its first row holds the
 * "Set as default address" checkbox (left) and the red trash icon (right); the field grid follows.
 * The frame turns red while any field has an error (DV-12). In read-only mode the checkbox and the
 * trash icon are shown disabled; the trash icon is also disabled on the default address.
 */
export function AddressItem<TForm extends FieldValues & PartnerAddressValues>({
  form,
  type,
  idPrefix,
  layout,
  defaultRule,
  index,
  hasErrors,
  readOnly,
  options,
  onRemove,
  onDefaultChange,
  defaultInputRef,
}: AddressItemProps<TForm>) {
  const { control, register, setValue } = form as unknown as UseFormReturn<AddressForm>;
  const arrayName = type.arrayName;
  const base = `${arrayName}.${index}` as const;
  const { errors: formErrors, isSubmitted } = useFormState({ control, name: base });
  const errors = formErrors[arrayName]?.[index];
  const [countryCode, isDefault, state, city] = useWatch({ control, name: [`${base}.countryCode`, `${base}.isDefault`, `${base}.state`, `${base}.city`] });
  const hasCountry = countryCode !== "";
  const region = useRegionData(countryCode);
  function setRegion(next: RegionValue) {
    const opts = { shouldDirty: true, shouldValidate: isSubmitted };
    if (next.state !== state) setValue(`${base}.state`, next.state, opts);
    if (next.city !== city) setValue(`${base}.city`, next.city, opts);
  }
  const title = `${type.itemLabel} #${index + 1}`;
  const itemId = `${idPrefix}-${type.key}-${index}`;
  const section = type.autofillSection;
  const span = spans(layout, type.withTaxId);
  // `exactlyOne` (customer): the current default cannot be unticked; ticking another one moves it.
  const locked = defaultRule === "exactlyOne" && isDefault;
  const removeLabel = `Remove ${type.itemLabel.toLowerCase()} #${index + 1}`;
  const removal = addressRemoval({ isOnly: !onRemove, isDefault, readOnly, itemLabel: type.itemLabel });
  const canRemove = Boolean(onRemove) && removal.canRemove;
  const removeHint = removal.hint;

  return (
    <div className="flex min-w-0 items-start gap-3 @min-[28rem]:gap-4">
      <span aria-hidden className="w-7 shrink-0 pt-4 text-gms-body font-semibold text-gms-text @min-[28rem]:w-9">{`#${index + 1}`}</span>
      <fieldset className={cx("@container min-w-0 flex-1 rounded-gms-lg border bg-gms-page px-4 pb-4 pt-3", hasErrors ? "border-gms-danger" : "border-transparent")}>
        <legend className="sr-only">{title}</legend>
        <div className="mb-4 flex min-h-[38px] items-center justify-between gap-3">
          <LabeledCheckbox
            id={`${itemId}-default`}
            label="Set as default address"
            checked={isDefault}
            locked={locked}
            hint={defaultRule === "exactlyOne" ? "One address must be the default" : undefined}
            readOnly={readOnly}
            onChange={onDefaultChange}
            inputRef={defaultInputRef}
          />
          <button
            type="button"
            aria-label={removeLabel}
            title={removeHint ?? removeLabel}
            disabled={!canRemove}
            onClick={canRemove ? onRemove : undefined}
            className={cx(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-gms-sm text-gms-danger hover:bg-gms-danger-subtle disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
              focusRing,
            )}
          >
            <Trash2 size={18} aria-hidden />
          </button>
        </div>
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
              <ComboboxField
                id={`${itemId}-country`}
                label="Country"
                required
                placeholder="Search country"
                options={options.countries}
                status={options.status}
                onRetry={options.onRetry}
                readOnly={readOnly}
                error={errors?.countryCode?.message}
                className={span.half}
                ref={field.ref}
                value={field.value}
                onChange={(code) => {
                  field.onChange(code);
                  // State and City belong to the chosen country: clear them when it changes.
                  setRegion({ state: "", city: "" });
                }}
                onBlur={field.onBlur}
              />
            )}
          />
          {/* DV-04 + owner 2026-10-19: State/City dropdowns from the country's list, disabled until a Country is chosen. */}
          {(["state", "city"] as const).map((kind) => (
            <Controller
              key={kind}
              control={control}
              name={`${base}.${kind}`}
              render={({ field }) => (
                <RegionField
                  kind={kind}
                  id={`${itemId}-${kind}`}
                  label={kind === "state" ? "State/Province" : "City"}
                  required={kind === "state"}
                  readOnly={readOnly}
                  hasCountry={hasCountry}
                  region={region}
                  value={{ state, city }}
                  onChange={setRegion}
                  onBlur={field.onBlur}
                  autoComplete={`${section} ${kind === "state" ? "address-level1" : "address-level2"}`}
                  error={errors?.[kind]?.message}
                  className={span.half}
                  ref={field.ref}
                />
              )}
            />
          ))}
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
      </fieldset>
    </div>
  );
}
