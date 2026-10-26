"use client";

import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, useFormState, useWatch, type UseFormReturn } from "react-hook-form";
import { Button, cx, focusRing } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { fieldFocusClass } from "@/components/ui/outlined-field";
import { compareRowDates, displayDate, formatDocumentNumber, rowStatuses } from "../numbering";
import { newRowValues, ROWS_MAX, type DocumentSetupFormValues } from "../schema";

const cellInput = cx(
  "h-10 w-full rounded-gms-md border border-gms-border bg-gms-surface px-3 text-gms-body text-gms-text placeholder:text-gms-text-placeholder",
  "aria-invalid:border-gms-danger aria-invalid:bg-gms-danger-subtle disabled:border-transparent disabled:bg-transparent disabled:px-0",
  fieldFocusClass,
);
const th = "h-[42px] border-b border-gms-border bg-gms-page px-3 text-left text-gms-body font-medium text-gms-text";
const td = "border-b border-gms-border px-3 py-2 align-top";

/**
 * Card "Document Numbering" (FE-DS-004): SNo, Date, Prefix, Suffix (owner: the text between Prefix and the
 * number, Q-DS-04), Start No, live Example and remove. Rows are re-sorted by Date when a Date loses focus
 * (not while typing) and after "+ Add row", which focuses the new row's Date.
 */
export function NumberingCard({ form, readOnly }: { form: UseFormReturn<DocumentSetupFormValues>; readOnly: boolean }) {
  const { control, register, getValues, setFocus } = form;
  const { fields, append, remove, move } = useFieldArray({ control, name: "rows", keyName: "fieldKey" });
  const rows = useWatch({ control, name: "rows" }) ?? [];
  const { errors } = useFormState({ control, name: "rows" });

  /** Moves rows into Date order without recreating them, so focus and errors stay with their row. */
  function sortRows() {
    const target = [...getValues("rows")].sort(compareRowDates);
    target.forEach((row, position) => {
      const current = getValues("rows").findIndex((item) => item.key === row.key);
      if (current !== position) move(current, position);
    });
  }

  const statuses = rowStatuses(rows.map((row) => row?.effectiveDate ?? ""));
  const rowsError = typeof errors.rows?.message === "string" ? errors.rows.message : errors.rows?.root?.message;

  return (
    <Card
      title="Document Numbering"
      titleId="document-numbering-title"
      titleClassName="text-gms-heading font-medium text-gms-text"
      trailing={
        !readOnly && (
          <Button
            icon={<Plus size={16} aria-hidden />}
            disabled={fields.length >= ROWS_MAX}
            onClick={() => {
              const row = newRowValues(getValues());
              append(row, { shouldFocus: false });
              window.requestAnimationFrame(() => {
                sortRows();
                const index = getValues("rows").findIndex((item) => item.key === row.key);
                if (index >= 0) setFocus(`rows.${index}.effectiveDate`);
              });
            }}
          >
            Add row
          </Button>
        )
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-0 text-gms-body text-gms-text" aria-labelledby="document-numbering-title">
          <colgroup>
            <col className="w-[96px]" />
            <col className="w-[170px]" />
            <col />
            <col className="w-[110px]" />
            <col className="w-[150px]" />
            <col className="w-[160px]" />
            {!readOnly && <col className="w-[52px]" />}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={th}>SNo</th>
              <th scope="col" className={th}>Date<span aria-hidden className="ml-0.5 text-gms-danger">*</span></th>
              <th scope="col" className={th}>Prefix</th>
              <th scope="col" className={th} title="Placed between Prefix and the number">Suffix</th>
              <th scope="col" className={cx(th, "text-right")}>Start No<span aria-hidden className="ml-0.5 text-gms-danger">*</span></th>
              <th scope="col" className={th}>Example</th>
              {!readOnly && <th scope="col" className={th}><span className="sr-only">Remove</span></th>}
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => {
              const position = index;
              const row = rows[index];
              if (!field || !row) return null;
              const rowErrors = errors.rows?.[index];
              const locked = readOnly || row.used;
              const status = statuses[index];
              const id = (name: string) => `numbering-${field.fieldKey}-${name}`;
              const errorText = (name: "effectiveDate" | "prefix" | "separator" | "startNo") => rowErrors?.[name]?.message;
              const cellError = (name: "effectiveDate" | "prefix" | "separator" | "startNo") => {
                const message = errorText(name);
                return message ? <p id={id(`${name}-error`)} className="mt-1 text-gms-label italic text-gms-danger">{message}</p> : null;
              };
              const describedBy = (name: "effectiveDate" | "prefix" | "separator" | "startNo") => (errorText(name) ? id(`${name}-error`) : undefined);
              return (
                <tr key={field.fieldKey} className={cx(rowErrors && "[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-gms-danger)]")}>
                  <td className={td}>
                    <div className="flex h-10 items-center gap-2">
                      <span className="tabular-nums">{position + 1}</span>
                      {status === "in-use" && <Badge variant="default">In use</Badge>}
                      {status === "upcoming" && <Badge variant="draft">Upcoming</Badge>}
                    </div>
                  </td>
                  <td className={td}>
                    {locked ? (
                      <span className="flex h-10 items-center">{displayDate(row.effectiveDate)}</span>
                    ) : (
                      <input
                        id={id("date")}
                        type="date"
                        aria-label={`Date, row ${position + 1}`}
                        aria-required
                        aria-invalid={errorText("effectiveDate") ? true : undefined}
                        aria-describedby={describedBy("effectiveDate")}
                        className={cellInput}
                        {...register(`rows.${index}.effectiveDate`, { onBlur: sortRows })}
                      />
                    )}
                    {cellError("effectiveDate")}
                  </td>
                  <td className={td}>
                    <input
                      id={id("prefix")}
                      aria-label={`Prefix, row ${position + 1}`}
                      aria-invalid={errorText("prefix") ? true : undefined}
                      aria-describedby={describedBy("prefix")}
                      disabled={locked}
                      autoComplete="off"
                      maxLength={10}
                      placeholder="e.g. PO"
                      className={cx(cellInput, "uppercase")}
                      {...register(`rows.${index}.prefix`)}
                    />
                    {cellError("prefix")}
                  </td>
                  <td className={td}>
                    <input
                      id={id("separator")}
                      aria-label={`Suffix (between Prefix and number), row ${position + 1}`}
                      aria-invalid={errorText("separator") ? true : undefined}
                      aria-describedby={describedBy("separator")}
                      disabled={locked}
                      autoComplete="off"
                      maxLength={3}
                      placeholder="-"
                      className={cellInput}
                      {...register(`rows.${index}.separator`)}
                    />
                    {cellError("separator")}
                  </td>
                  <td className={td}>
                    <input
                      id={id("start")}
                      inputMode="numeric"
                      aria-label={`Start No, row ${position + 1}`}
                      aria-required
                      aria-invalid={errorText("startNo") ? true : undefined}
                      aria-describedby={describedBy("startNo")}
                      disabled={locked}
                      autoComplete="off"
                      maxLength={9}
                      className={cx(cellInput, "text-right tabular-nums")}
                      {...register(`rows.${index}.startNo`, {
                        onChange: (event: { target: HTMLInputElement }) => {
                          event.target.value = event.target.value.replace(/\D/g, "");
                        },
                      })}
                    />
                    {cellError("startNo")}
                  </td>
                  <td className={td}>
                    <span className="flex h-10 items-center truncate font-medium tabular-nums" aria-label={`Example number, row ${position + 1}`}>
                      {row.startNo.trim() === "" ? "—" : formatDocumentNumber(row.prefix ?? "", row.separator ?? "", row.startNo)}
                    </span>
                  </td>
                  {!readOnly && (
                    <td className={td}>
                      <button
                        type="button"
                        aria-label={`Remove row ${position + 1}`}
                        disabled={fields.length <= 1 || row.used}
                        title={row.used ? "This row is already used by documents" : fields.length <= 1 ? "At least one row is needed" : undefined}
                        onClick={() => remove(index)}
                        className={cx("flex size-10 items-center justify-center rounded-gms-md text-gms-danger hover:bg-gms-danger-subtle disabled:cursor-not-allowed disabled:text-gms-text-placeholder disabled:hover:bg-transparent", focusRing)}
                      >
                        <Trash2 size={18} aria-hidden />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rowsError && <p role="alert" className="mt-2 text-gms-label italic text-gms-danger">{rowsError}</p>}
      <p className="mt-3 text-gms-label text-gms-text-secondary">A row is used from its date until the next row&apos;s date. Example = Prefix + Suffix + number.</p>
    </Card>
  );
}
