"use client";

import { Controller, useFormState, useWatch, type UseFormReturn } from "react-hook-form";
import { cx } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldShell, fieldFocusClass, fieldFocusWithinClass, readOnlyControlClass, TextField } from "@/components/ui/outlined-field";
import { Switch } from "@/components/ui/switch";
import { formatRate, sanitizeRate } from "../rates";
import { DESCRIPTION_MAX, type CurrencyFormValues } from "../schema";

type CurrencyFieldsCardProps = {
  form: UseFormReturn<CurrencyFormValues>;
  readOnly: boolean;
  /** Edit mode of a saved currency: the code can't change after saving (Q-CUR-04). */
  codeLocked: boolean;
  /** Company Profile currency; null before the profile is saved. */
  baseCode: string | null;
  /** The record is the base currency: no rates, always active (SA-CUR-02). */
  isBase: boolean;
};

const ID = "currency";
/** Same 404 px field column as Stone Master (ui-spec "Page structure"). */
const column = "flex w-full max-w-[404px] flex-col gap-5";

/** Currency card (ui-spec C-02…C-06): Active in the header, Code Name, Name, Description, Exchange Rate panel. */
export function CurrencyFieldsCard({ form, readOnly, codeLocked, baseCode, isBase }: CurrencyFieldsCardProps) {
  const { control, register } = form;
  const { errors } = useFormState({ control });
  const description = useWatch({ control, name: "description" }) ?? "";

  return (
    <Card
      title="Currency"
      titleId={`${ID}-card-title`}
      titleClassName="text-gms-heading font-medium text-gms-text"
      headerClassName="min-h-[65px]"
      className="flex flex-1 flex-col"
      bodyClassName="flex-1"
      trailing={
        <Controller
          control={control}
          name="active"
          render={({ field }) => (
            <Switch
              id={`${ID}-active`}
              label="Active"
              checked={field.value}
              onChange={field.onChange}
              readOnly={readOnly}
              disabled={!readOnly && isBase}
              hint={!readOnly && isBase ? "The company currency is always active" : undefined}
            />
          )}
        />
      }
    >
      <div className={column}>
        <div>
          <TextField
            id={`${ID}-code`}
            label="Code Name"
            required
            autoComplete="off"
            maxLength={3}
            placeholder="e.g. USD"
            readOnly={readOnly || codeLocked}
            error={errors.code?.message}
            className="[&_input]:uppercase [&_input]:placeholder:normal-case"
            {...register("code")}
          />
          {codeLocked && !readOnly && <p className="mt-1 pl-4 text-gms-label text-gms-text-secondary">Code can&apos;t be changed after saving</p>}
        </div>
        <TextField id={`${ID}-name`} label="Name" required autoComplete="off" placeholder="e.g. US Dollar" readOnly={readOnly} error={errors.name?.message} {...register("name")} />
        <FieldShell id={`${ID}-description`} label="Description" required error={errors.description?.message} readOnly={readOnly}>
          <div className="relative">
            <textarea
              id={`${ID}-description`}
              aria-required
              aria-invalid={errors.description ? true : undefined}
              aria-describedby={errors.description ? `${ID}-description-error` : `${ID}-description-count`}
              readOnly={readOnly}
              disabled={readOnly}
              rows={3}
              maxLength={DESCRIPTION_MAX}
              placeholder="Notes for your team, e.g. which vendors use this currency"
              className={cx(
                "block min-h-[86px] w-full resize-y rounded-gms-md border px-4 pt-4 pb-7 text-gms-body text-gms-text transition-colors placeholder:text-gms-text-placeholder",
                errors.description ? "border-gms-danger bg-gms-danger-subtle" : readOnly ? "border-gms-border bg-gms-field-disabled" : "border-gms-border bg-gms-surface hover:border-gms-text-placeholder",
                readOnly && readOnlyControlClass,
                fieldFocusClass,
              )}
              {...register("description")}
            />
            <span id={`${ID}-description-count`} className="pointer-events-none absolute right-4 bottom-2 text-gms-label text-gms-text-secondary">
              {`${description.length}/${DESCRIPTION_MAX}`}
            </span>
          </div>
        </FieldShell>

        <section aria-labelledby={`${ID}-rate-title`} className="rounded-gms-lg bg-gms-surface-sunken p-5">
          <h3 id={`${ID}-rate-title`} className="text-base font-medium text-gms-text">Exchange Rate</h3>
          {isBase ? (
            <p className="mt-3 text-gms-body text-gms-text-secondary">
              {`Base currency — other currencies' rates are set against ${baseCode}. Change it in Company Profile.`}
            </p>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-1 gap-4 min-[400px]:grid-cols-2">
                <RateField form={form} name="sellingRate" label="Selling Rate" baseCode={baseCode} readOnly={readOnly} help="Used when you sell to customers in this currency." />
                <RateField form={form} name="buyingRate" label="Buying Rate" baseCode={baseCode} readOnly={readOnly} help="Used when you buy from vendors in this currency." />
              </div>
              {!baseCode && <p className="mt-3 text-gms-label text-gms-text-secondary">Set the company currency in Company Profile.</p>}
            </>
          )}
        </section>
      </div>
    </Card>
  );
}

type RateFieldProps = {
  form: UseFormReturn<CurrencyFormValues>;
  name: "sellingRate" | "buyingRate";
  label: string;
  baseCode: string | null;
  readOnly: boolean;
  help: string;
};

/** "1 = [rate] THB" (ui-spec C-06): digits and one dot, ≤ 4 decimals, shown with 4 decimals after blur. */
function RateField({ form, name, label, baseCode, readOnly, help }: RateFieldProps) {
  const id = `${ID}-${name}`;
  const { errors } = useFormState({ control: form.control, name });
  const error = errors[name]?.message;
  return (
    <div>
      <label htmlFor={id} className="text-gms-body font-medium text-gms-text">
        {label}
        <span aria-hidden className="ml-0.5 text-gms-danger">*</span>
      </label>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <div
            className={cx(
              "mt-2 flex h-10 items-center gap-2 rounded-gms-md border px-3 text-gms-body transition-colors",
              error ? "border-gms-danger bg-gms-danger-subtle" : readOnly ? "border-gms-border bg-gms-field-disabled" : "border-gms-border bg-gms-surface hover:border-gms-text-placeholder",
              !readOnly && fieldFocusWithinClass,
            )}
          >
            <span aria-hidden className="shrink-0 text-gms-text">1 =</span>
            <input
              ref={field.ref}
              id={id}
              name={field.name}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.0000"
              aria-required
              aria-invalid={error ? true : undefined}
              aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
              readOnly={readOnly}
              disabled={readOnly}
              value={field.value}
              onChange={(event) => field.onChange(sanitizeRate(event.target.value))}
              onBlur={() => {
                field.onChange(formatRate(field.value));
                field.onBlur();
              }}
              className={cx("min-w-0 flex-1 bg-transparent text-right tabular-nums text-gms-text outline-none placeholder:text-gms-text-placeholder", readOnly && readOnlyControlClass)}
            />
            <span className="shrink-0 text-gms-label font-medium text-gms-text">{baseCode ?? "base"}</span>
          </div>
        )}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-gms-label italic text-gms-danger">
          {error}
        </p>
      )}
      <p id={`${id}-help`} className="mt-2 text-gms-label text-gms-text-secondary">{help}</p>
    </div>
  );
}
