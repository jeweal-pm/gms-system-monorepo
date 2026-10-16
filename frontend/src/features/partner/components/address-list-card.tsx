"use client";

import { Plus } from "lucide-react";
import { useRef } from "react";
import { useFieldArray, useFormState, type FieldValues, type UseFormReturn } from "react-hook-form";
import { cx, focusRing } from "@/components/ui/button";
import { Card, CountBadge } from "@/components/ui/card";
import type { AddressTypeConfig } from "../address-types";
import type { OptionsState } from "../options";
import {
  ADDRESS_MAX,
  addressIndexesWithErrors,
  emptyAddress,
  type AddressArrayName,
  type AddressFormValue,
  type DefaultRule,
  type PartnerAddressValues,
} from "../schema";
import { AddressItem, type AddressLayout } from "./address-item";

/** Internal view of the form: only the configured address array is touched. */
type AddressForm = Record<AddressArrayName, AddressFormValue[]>;

type AddressListCardProps<TForm extends FieldValues & PartnerAddressValues> = {
  form: UseFormReturn<TForm>;
  type: AddressTypeConfig;
  /** DOM id prefix, e.g. "customer". */
  idPrefix: string;
  layout: AddressLayout;
  defaultRule: DefaultRule;
  readOnly: boolean;
  options: OptionsState;
};

/**
 * Partner C-09 (customer FE-CUS-007 / FE-CUS-R3-002, vendor FE-VEN-006 / FE-VEN-R4-002): one address
 * type's list. 1–10 items, all always open (rev 3/4 removed the accordion); item #1 cannot be removed. Default handling follows `defaultRule`:
 * - `exactlyOne` (customer P-01): ticking moves the default, it can't be unticked, removing it makes #1 the default.
 * - `atMostOne` (vendor Q-VEN-03): ticking moves the default, unticking leaves none, removing it leaves none.
 */
export function AddressListCard<TForm extends FieldValues & PartnerAddressValues>({
  form,
  type,
  idPrefix,
  layout,
  defaultRule,
  readOnly,
  options,
}: AddressListCardProps<TForm>) {
  const { control, getValues, setValue } = form as unknown as UseFormReturn<AddressForm>;
  const arrayName = type.arrayName;
  const { fields, append, remove } = useFieldArray({ control, name: arrayName, keyName: "fieldKey" });
  const defaultInputs = useRef(new Map<string, HTMLInputElement>());
  const { errors } = useFormState({ control, name: arrayName });
  const errorIndexes = addressIndexesWithErrors(errors as Record<string, unknown>, arrayName);
  const atLimit = fields.length >= ADDRESS_MAX;
  const limitHelpId = `${idPrefix}-${type.key}-limit`;

  function changeDefault(index: number, checked: boolean) {
    if (!checked) {
      // `exactlyOne`: the checkbox is locked, so this only happens for `atMostOne`.
      if (defaultRule === "atMostOne") setValue(`${arrayName}.${index}.isDefault`, false, { shouldDirty: true });
      return;
    }
    getValues(arrayName).forEach((item, itemIndex) => {
      const value = itemIndex === index;
      if (item.isDefault !== value) setValue(`${arrayName}.${itemIndex}.isDefault`, value, { shouldDirty: true });
    });
  }

  function removeAt(index: number) {
    if (index === 0) return;
    // `exactlyOne`: removing the default makes #1 the default (P-01). Set it before removing so the array action is not stacked.
    if (defaultRule === "exactlyOne" && getValues(`${arrayName}.${index}.isDefault`)) setValue(`${arrayName}.0.isDefault`, true, { shouldDirty: true });
    const previousKey = fields[index - 1]?.fieldKey;
    remove(index);
    // Focus moves to the previous card's first control (its default checkbox).
    if (previousKey) defaultInputs.current.get(previousKey)?.focus();
  }

  function add() {
    if (atLimit) return;
    const nextIndex = fields.length;
    append(emptyAddress(false), { shouldFocus: true, focusName: `${arrayName}.${nextIndex}.name` });
  }

  return (
    <Card
      title={type.title}
      titleId={`${idPrefix}-${type.key}-title`}
      titleClassName="text-lg font-medium text-gms-text"
      headerClassName="min-h-[55px] px-4"
      bodyClassName="@container p-4"
      badge={<CountBadge>{fields.length}</CountBadge>}
      className="min-w-0"
    >
      <div className="space-y-4">
        {fields.map((field, index) => (
          <AddressItem
            key={field.fieldKey}
            form={form}
            type={type}
            idPrefix={idPrefix}
            layout={layout}
            defaultRule={defaultRule}
            index={index}
            hasErrors={errorIndexes.includes(index)}
            readOnly={readOnly}
            options={options}
            onRemove={index > 0 && !readOnly ? () => removeAt(index) : undefined}
            onDefaultChange={(checked) => changeDefault(index, checked)}
            defaultInputRef={(element) => {
              if (element) defaultInputs.current.set(field.fieldKey, element);
              else defaultInputs.current.delete(field.fieldKey);
            }}
          />
        ))}
        {!readOnly && (
          <div>
            <button
              type="button"
              onClick={add}
              disabled={atLimit}
              aria-describedby={atLimit ? limitHelpId : undefined}
              className={cx(
                "flex h-[42px] w-full items-center justify-center gap-2 rounded-gms-md border border-dashed border-gms-primary text-[15px] font-medium text-gms-primary transition-colors hover:bg-gms-primary-subtle disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
                focusRing,
              )}
            >
              <Plus size={18} aria-hidden />
              {`Add another ${type.key} address`}
            </button>
            {atLimit && (
              <p id={limitHelpId} className="mt-1.5 text-xs text-gms-text-secondary">
                {`Up to ${ADDRESS_MAX} ${type.key} addresses`}
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
