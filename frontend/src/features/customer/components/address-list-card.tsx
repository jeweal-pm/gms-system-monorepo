"use client";

import { Plus } from "lucide-react";
import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { useFieldArray, useFormState, type UseFormReturn } from "react-hook-form";
import { cx, focusRing } from "@/components/ui/button";
import { Card, CountBadge } from "@/components/ui/card";
import { ADDRESS_MAX, addressArrayName, addressIndexesWithErrors, emptyAddress, type AddressType, type CustomerFormValues } from "../schema";
import { AddressItem } from "./address-item";
import type { OptionsState } from "./customer-information-card";

export type AddressListHandle = {
  /** Expands the given item indexes (submit with errors, FE-CUS-008). */
  expand: (indexes: readonly number[]) => void;
};

type AddressListCardProps = {
  form: UseFormReturn<CustomerFormValues>;
  type: AddressType;
  readOnly: boolean;
  options: OptionsState;
  ref?: Ref<AddressListHandle>;
};

const titles: Record<AddressType, string> = { invoice: "Invoice Address", shipping: "Shipping Address" };

/**
 * C-10 / C-13 (FE-CUS-007): Invoice or Shipping address list. 1–10 items; item #1 cannot be
 * removed; exactly one default per type (P-01, enforced here in the change handlers).
 */
export function AddressListCard({ form, type, readOnly, options, ref }: AddressListCardProps) {
  const arrayName = addressArrayName[type];
  const { control, getValues, setValue } = form;
  const { fields, append, remove } = useFieldArray({ control, name: arrayName, keyName: "fieldKey" });
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const headerRefs = useRef(new Map<string, HTMLButtonElement>());
  const { errors } = useFormState({ control, name: arrayName });
  const errorIndexes = addressIndexesWithErrors(errors as Record<string, unknown>, arrayName);
  const atLimit = fields.length >= ADDRESS_MAX;
  const limitHelpId = `customer-${type}-limit`;

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

  function setDefault(index: number) {
    getValues(arrayName).forEach((item, itemIndex) => {
      const value = itemIndex === index;
      if (item.isDefault !== value) setValue(`${arrayName}.${itemIndex}.isDefault`, value, { shouldDirty: true });
    });
  }

  function removeAt(index: number) {
    if (index === 0) return;
    // Removing the default makes #1 the default (P-01). Set it before removing so the array action is not stacked.
    if (getValues(`${arrayName}.${index}.isDefault`)) setValue(`${arrayName}.0.isDefault`, true, { shouldDirty: true });
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
      title={titles[type]}
      titleId={`customer-${type}-title`}
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
            index={index}
            expanded={!collapsed.has(field.fieldKey)}
            hasErrors={errorIndexes.includes(index)}
            readOnly={readOnly}
            options={options}
            onToggle={() => toggle(field.fieldKey)}
            onRemove={index > 0 && !readOnly ? () => removeAt(index) : undefined}
            onSetDefault={() => setDefault(index)}
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
              {type === "invoice" ? "Add another invoice address" : "Add another shipping address"}
            </button>
            {atLimit && (
              <p id={limitHelpId} className="mt-1.5 text-xs text-gms-text-secondary">
                {`Up to ${ADDRESS_MAX} ${type} addresses`}
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
