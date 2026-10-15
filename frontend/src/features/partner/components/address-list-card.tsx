"use client";

import { Plus } from "lucide-react";
import { useImperativeHandle, useRef, useState, type Ref } from "react";
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

export type AddressListHandle = {
  /** Expands the given item indexes (submit with errors). */
  expand: (indexes: readonly number[]) => void;
};

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
  ref?: Ref<AddressListHandle>;
};

/**
 * Partner C-09 (customer FE-CUS-007, vendor FE-VEN-006): one address type's list. 1–10 items;
 * item #1 cannot be removed. Default handling follows `defaultRule`:
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
  ref,
}: AddressListCardProps<TForm>) {
  const { control, getValues, setValue } = form as unknown as UseFormReturn<AddressForm>;
  const arrayName = type.arrayName;
  const { fields, append, remove } = useFieldArray({ control, name: arrayName, keyName: "fieldKey" });
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const headerRefs = useRef(new Map<string, HTMLButtonElement>());
  const { errors } = useFormState({ control, name: arrayName });
  const errorIndexes = addressIndexesWithErrors(errors as Record<string, unknown>, arrayName);
  const atLimit = fields.length >= ADDRESS_MAX;
  const limitHelpId = `${idPrefix}-${type.key}-limit`;

  useImperativeHandle(
    ref,
    () => ({
      expand: (indexes) => {
        const keys = indexes.map((index) => fields[index]?.fieldKey).filter((key): key is string => Boolean(key));
        if (keys.length === 0) return;
        setCollapsed((current) => new Set([...current].filter((key) => !keys.includes(key))));
      },
    }),
    [fields],
  );

  function toggle(fieldKey: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(fieldKey)) next.delete(fieldKey);
      else next.add(fieldKey);
      return next;
    });
  }

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
    if (previousKey) headerRefs.current.get(previousKey)?.focus();
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
            expanded={!collapsed.has(field.fieldKey)}
            hasErrors={errorIndexes.includes(index)}
            readOnly={readOnly}
            options={options}
            onToggle={() => toggle(field.fieldKey)}
            onRemove={index > 0 && !readOnly ? () => removeAt(index) : undefined}
            onDefaultChange={(checked) => changeDefault(index, checked)}
            headerButtonRef={(element) => {
              if (element) headerRefs.current.set(field.fieldKey, element);
              else headerRefs.current.delete(field.fieldKey);
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
