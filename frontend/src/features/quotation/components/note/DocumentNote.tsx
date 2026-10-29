"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { useDocumentKind } from "../../document-kind";
import type { QuotationFormValues } from "../../schema";

/** Wording defaults to the quotation; memo-out passes its own. */
export function DocumentNote({
  placeholder = "e.g. Prices valid for 30 days. 50% deposit, balance before delivery.",
  hint = "Printed on the quotation for the customer",
  max = MAX_DOCUMENT_NOTE,
}: { placeholder?: string; hint?: string; max?: number }) {
  const { register, control } = useFormContext<QuotationFormValues>();
  const note = useWatch({ control, name: "documentNote" });
  const { max, hint } = useDocumentKind().documentNote;

  return (
    <div className="min-w-0 flex-1">
      <h2 className="mb-4 text-lg font-medium text-[#1C252E]">Document Note</h2>
      <textarea
        rows={4}
        maxLength={max}
        className="w-full resize-none rounded-lg border border-[#E3E6EA] px-3 py-2.5 text-sm text-[#1C252E] outline-none placeholder:text-[#A9B1B9] focus:border-[#0E5E63] focus:ring-2 focus:ring-[#0E5E63]/15 disabled:bg-[#F6F7F8]"
        {...register("documentNote")}
      />
      <div className="mt-1 flex justify-between text-xs text-[#6B7480]">
        <span>{hint}</span>
        <span>
          {note.length} / {max}
        </span>
      </div>
    </div>
  );
}
