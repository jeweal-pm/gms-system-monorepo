"use client";

import { Controller, useFormState, useWatch, type UseFormReturn } from "react-hook-form";
import { cx } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MultiSelect } from "@/components/ui/multi-select";
import { TextField } from "@/components/ui/outlined-field";
import { SelectField, type SelectOption } from "@/components/ui/select-field";
import { Switch } from "@/components/ui/switch";
import { optionLabel, PART_OPTION, sizeAfterShapeChange, sizesForShape, type StoneOption, type StoneOptions } from "../api";
import type { StonePage } from "../kinds";
import type { StoneFormValues } from "../schema";
import { isPartRequired, PART_FIELD, PART_LABEL, type PartKey } from "../stone-code";
import { CopyCodeButton } from "./copy-code-button";
import { PartOrderList } from "./part-order-list";

export type OptionsState = { data: StoneOptions | undefined; status: "loading" | "error" | "ready"; onRetry: () => void };

type StoneFieldsCardProps = {
  page: StonePage;
  form: UseFormReturn<StoneFormValues>;
  readOnly: boolean;
  options: OptionsState;
  /** Live Auto code built from the chosen parts (Stone Code page). */
  autoCode: string;
};

const ID = "stone";
/** S1: one 404 px column of fields (Stone Code field 530 px). */
const column = "flex w-full max-w-[404px] flex-col gap-5";

/** Active choices, plus the saved (possibly inactive) one so it still displays. */
function selectOptions(list: readonly StoneOption[] | undefined, current: string | readonly string[]): SelectOption[] {
  const keep = new Set(typeof current === "string" ? [current] : current);
  return (list ?? []).filter((option) => option.active || keep.has(option.id)).map((option) => ({ value: option.id, label: optionLabel(option) }));
}

/**
 * Stone Master card (S1–S6): title = page name, Active switch in the header, then the page's fields.
 * Read-only/view mode uses the shared read-only field style.
 */
export function StoneFieldsCard({ page, form, readOnly, options, autoCode }: StoneFieldsCardProps) {
  const { control, register, setValue, getValues } = form;
  const { errors } = useFormState({ control });
  const [mode, shapeId, manualCode, partOrder] = useWatch({ control, name: ["mode", "shapeId", "code", "partOrder"] });
  const status = options.status;

  const textFields = page.fields !== "stoneCode" && (
    <>
      <TextField id={`${ID}-code`} label="Code Name" required autoComplete="off" placeholder={page.codePlaceholder} readOnly={readOnly} error={errors.code?.message} className="[&_input]:uppercase" {...register("code")} />
      <TextField id={`${ID}-name`} label="Name" required autoComplete="off" placeholder={page.namePlaceholder} readOnly={readOnly} error={errors.name?.message} {...register("name")} />
    </>
  );

  function partSelect(part: PartKey) {
    const field = PART_FIELD[part];
    const list = options.data?.[PART_OPTION[part]];
    return (
      <Controller
        control={control}
        name={field}
        render={({ field: input }) => {
          // Size: only the sizes available on the chosen shape (Q-SM-03); disabled until a shape is chosen.
          const source = part === "size" ? sizesForShape(options.data, shapeId) : list;
          return (
            <SelectField
              id={`${ID}-${part}`}
              label={PART_LABEL[part]}
              required={isPartRequired(part, partOrder ?? [])}
              placeholder={part === "size" && !shapeId ? "Choose a shape first" : "Select"}
              options={selectOptions(source, input.value)}
              status={status}
              onRetry={options.onRetry}
              readOnly={readOnly}
              disabled={!readOnly && part === "size" && !shapeId}
              error={errors[field]?.message}
              value={input.value}
              onBlur={input.onBlur}
              onChange={(event) => {
                input.onChange(event.target.value);
                // A size the new shape doesn't have is cleared (UT-SM-05).
                if (part === "shape") {
                  const size = getValues("sizeId");
                  const kept = sizeAfterShapeChange(options.data, event.target.value, size);
                  if (kept !== size) setValue("sizeId", kept, { shouldDirty: true });
                }
              }}
            />
          );
        }}
      />
    );
  }

  return (
    <Card
      title={page.entity.singular}
      titleId={`${ID}-card-title`}
      titleClassName="text-gms-heading font-medium text-gms-text"
      headerClassName="min-h-[65px]"
      className="flex flex-1 flex-col"
      bodyClassName="flex-1"
      trailing={
        <Controller
          control={control}
          name="active"
          render={({ field }) => <Switch id={`${ID}-active`} label="Active" checked={field.value} onChange={field.onChange} readOnly={readOnly} />}
        />
      }
    >
      {page.fields === "stoneCode" ? (
        <div className="flex w-full max-w-[530px] flex-col gap-5">
          <Controller
            control={control}
            name="mode"
            render={({ field }) => (
              <fieldset className="flex items-center gap-6" disabled={readOnly}>
                <legend className="sr-only">Code mode</legend>
                {(["MANUAL", "AUTO"] as const).map((value) => (
                  <label key={value} className={cx("inline-flex items-center gap-2 text-gms-body text-gms-text", readOnly ? "cursor-default" : "cursor-pointer")}>
                    <input
                      type="radio"
                      name={`${ID}-mode`}
                      value={value}
                      checked={field.value === value}
                      onChange={() => {
                        // Auto → Manual keeps the current code as the starting text.
                        if (value === "MANUAL" && field.value === "AUTO") setValue("code", autoCode, { shouldDirty: true });
                        field.onChange(value);
                      }}
                      className="h-5 w-5 accent-[var(--color-gms-primary)]"
                    />
                    {value === "MANUAL" ? "Manual Code" : "Auto Code"}
                  </label>
                ))}
              </fieldset>
            )}
          />
          <div>
            {/* Copy button inside the field (owner 2026-10-19); the input keeps room for it on the right. */}
            <div className="relative">
              {mode === "AUTO" ? (
                <TextField id={`${ID}-code`} label="Stone Code" required readOnly value={autoCode} placeholder={page.codePlaceholder} error={errors.code?.message} className="[&_input]:pr-12" />
              ) : (
                <TextField id={`${ID}-code`} label="Stone Code" required autoComplete="off" placeholder={page.codePlaceholder} readOnly={readOnly} error={errors.code?.message} className="[&_input]:pr-12 [&_input]:uppercase" {...register("code")} />
              )}
              <CopyCodeButton value={mode === "AUTO" ? autoCode : (manualCode ?? "").toUpperCase()} />
            </div>
            <p className="mt-1 text-gms-label text-gms-text-secondary">
              {mode === "AUTO"
                ? 'Auto Code: built from the parts below, in their order: the first two together, then "-", then the rest (e.g. RUB1.0-RDDEX). Choose Manual Code to type your own.'
                : "Manual Code: you can change the code freely. Choosing Auto Code again replaces it with the code built from the parts."}
            </p>
          </div>
          <Controller
            control={control}
            name="partOrder"
            render={({ field }) => <PartOrderList order={field.value} onChange={field.onChange} readOnly={readOnly} renderPart={partSelect} />}
          />
        </div>
      ) : (
        <div className={column}>
          {textFields}
          {page.fields === "stoneName" && (
            <>
              <Controller
                control={control}
                name="groupId"
                render={({ field }) => (
                  <SelectField
                    id={`${ID}-group`}
                    label="Stone Group"
                    required
                    placeholder="Select stone group"
                    options={selectOptions(options.data?.group, field.value)}
                    status={status}
                    onRetry={options.onRetry}
                    readOnly={readOnly}
                    error={errors.groupId?.message}
                    value={field.value}
                    onBlur={field.onBlur}
                    onChange={(event) => field.onChange(event.target.value)}
                  />
                )}
              />
              <TextField id={`${ID}-hsn`} label="HSN" inputMode="numeric" autoComplete="off" placeholder="e.g. 7103" readOnly={readOnly} error={errors.hsn?.message} {...register("hsn")} />
            </>
          )}
          {page.fields === "shape" && (
            <Controller
              control={control}
              name="sizeIds"
              render={({ field }) => (
                <MultiSelect
                  id={`${ID}-sizes`}
                  label="Sizes Available"
                  required
                  placeholder="+ Add size"
                  options={(options.data?.size ?? []).filter((option) => option.active || field.value.includes(option.id)).map((option) => ({ id: option.id, label: option.active ? option.name : `${option.name} (inactive)` }))}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={errors.sizeIds?.message}
                  readOnly={readOnly}
                  status={status}
                />
              )}
            />
          )}
        </div>
      )}
    </Card>
  );
}
