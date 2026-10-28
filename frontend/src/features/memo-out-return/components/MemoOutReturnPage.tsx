"use client";

import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Field, FormSelect, TextInput } from "@/features/quotation/components/ui";
import { quotationCurrencyOptions, quotationExchangeRate } from "@/features/quotation/lib/currency";
import { DocumentDaybook, useDocumentAccess } from "@/features/trade-document/document-api";
import { DocumentForm, type DocumentFormConfig } from "@/features/trade-document/document-form";
import { masterTrpc } from "@/lib/master-trpc";
import { retryTransient } from "@/lib/trpc-error";
import {
  emptyMemoOutReturn,
  fromMemoOutReturn,
  MEMO_OUT_RETURN_HREF,
  MEMO_OUT_RETURN_NOTE_MAX,
  mapMemoOutReturnSaveError,
  memoOutReturnHref,
  memoOutReturnLoadError,
  memoOutReturnSchema,
  toMemoOutReturnInput,
  useMemoOutReturnApi,
  useMemoOutReturnDaybook,
  useMemoOutReturnDetail,
  type MemoOutReturnFormValues,
  type MemoOutReturnInput,
  type MemoOutReturnOptions,
} from "../api";
import { ReturnItemTable } from "./ReturnItemTable";

export { MEMO_OUT_RETURN_HREF, MEMO_OUT_RETURN_NOTE_MAX };

/**
 * Header of memo-out-return source 01: Doc Date, Vendor, Address; Due Date, Currency, Exchange Rate (read-only,
 * Setup › Currency) and Ref. Choosing a vendor picks its default address and currency.
 */
export function MemoOutReturnInfoForm({ options }: { options: MemoOutReturnOptions | undefined }) {
  const { register, control, setValue, formState: { errors } } = useFormContext<MemoOutReturnFormValues>();
  const vendorId = useWatch({ control, name: "vendorId" });
  const currency = useWatch({ control, name: "currency" }) ?? "";
  const exchangeRate = useWatch({ control, name: "exchangeRate" }) ?? "";
  const currencyOptions = masterTrpc.currency.options.useQuery(undefined, { staleTime: 60_000, retry: retryTransient });
  const items = currencyOptions.data?.items ?? [];
  const baseCode = currencyOptions.data?.baseCode ?? null;
  const vendors = options?.vendors ?? [];
  const vendorOptions = vendors.map((v) => ({ value: v.id, label: `${v.code} · ${v.name}${v.active ? "" : " (inactive)"}` }));
  const addressOptions = (vendors.find((v) => v.id === vendorId)?.addresses ?? []).map((a) => ({ value: a.id, label: a.label }));

  // Owner 2026-10-27: one Exchange Rate per currency, read-only here.
  const onCurrencyChange = (code: string) => setValue("exchangeRate", quotationExchangeRate(items, baseCode, code), { shouldDirty: true });
  const onVendorChange = (id: string) => {
    const vendor = vendors.find((v) => v.id === id);
    const addresses = vendor?.addresses ?? [];
    setValue("addressId", (addresses.find((a) => a.isDefault) ?? addresses[0])?.id ?? "", { shouldDirty: true });
    if (vendor?.currency) {
      setValue("currency", vendor.currency, { shouldDirty: true });
      onCurrencyChange(vendor.currency);
    }
  };

  const initialRate = currencyOptions.data ? quotationExchangeRate(items, baseCode, currency) : "";
  useEffect(() => {
    if (exchangeRate === "" && initialRate !== "") setValue("exchangeRate", initialRate, { shouldDirty: false });
  }, [exchangeRate, initialRate, setValue]);

  return (
    <div className="flex flex-col gap-5 px-6 py-6">
      <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-[200px_1fr_1fr]">
        <Field label="Doc Date" required error={errors.docDate?.message}>
          <TextInput type="date" {...register("docDate")} />
        </Field>
        <Field label="Vendor" required error={errors.vendorId?.message}>
          <FormSelect<MemoOutReturnFormValues> name="vendorId" options={vendorOptions} onValueChange={onVendorChange} />
        </Field>
        <Field label="Address" required error={errors.addressId?.message}>
          <FormSelect<MemoOutReturnFormValues> name="addressId" options={addressOptions} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-[200px_1fr_1fr_1fr]">
        <Field label="Due Date" required error={errors.dueDate?.message}>
          <TextInput type="date" {...register("dueDate")} />
        </Field>
        <Field label="Currency" required error={errors.currency?.message}>
          <FormSelect<MemoOutReturnFormValues> name="currency" options={quotationCurrencyOptions(items, currency)} onValueChange={onCurrencyChange} />
        </Field>
        <Field label={baseCode && currency && currency !== baseCode ? `Exchange Rate (1 ${currency} = ? ${baseCode})` : "Exchange Rate"} error={errors.exchangeRate?.message}>
          <TextInput readOnly tabIndex={-1} placeholder="Exchange Rate" {...register("exchangeRate")} />
        </Field>
        <Field label="Ref.">
          <TextInput maxLength={100} {...register("ref")} />
        </Field>
      </div>
    </div>
  );
}

function MemoOutReturnDaybook() {
  const daybook = useMemoOutReturnDaybook();
  return (
    <DocumentDaybook
      plural="memo out returns"
      href={memoOutReturnHref}
      state={{
        isPending: daybook.isPending,
        isError: daybook.isError,
        errorMessage: daybook.error ? memoOutReturnLoadError(daybook.error) : undefined,
        items: (daybook.data?.items ?? []).map((item) => ({ id: item.id, docNo: item.docNo, docDate: item.docDate, status: item.status, name: String(item.vendorName ?? "") })),
      }}
    />
  );
}

/**
 * memo-out-return UI rev 3 + SA rev 1 (owner 2026-10-28): vendor document; number from Document Setup › Memo Out
 * Return. Rows are picked from Memo Stock and only their Return quantity is edited, so there is no row editor;
 * the Memo Stock / Memo Outstanding picker waits for a vendor memo source.
 */
const CONFIG: DocumentFormConfig<MemoOutReturnFormValues, MemoOutReturnInput, MemoOutReturnOptions> = {
  noun: "memo out return",
  noLabel: "Memo Out Return No.:",
  newHref: MEMO_OUT_RETURN_HREF,
  detailHref: memoOutReturnHref,
  schema: memoOutReturnSchema,
  empty: emptyMemoOutReturn,
  toInput: toMemoOutReturnInput,
  useApi: useMemoOutReturnApi,
  partyId: (values) => values?.vendorId,
  header: ({ options }) => <MemoOutReturnInfoForm options={options} />,
  mapSaveError: mapMemoOutReturnSaveError,
  pickLabel: "Memo Outstanding",
  pickHint: "Memo Outstanding isn't available yet",
  emptyRowText: "Empty row · click to pick from Memo Stock",
  itemTable: ReturnItemTable,
  rowEditor: false,
  emptyRowNotice: "Memo Stock isn't available yet",
  noteMax: MEMO_OUT_RETURN_NOTE_MAX,
  notePlaceholder: "e.g. Returned in good condition; 1 stone kept for decision.",
  noteHint: "Printed on the memo out return",
  daybook: <MemoOutReturnDaybook />,
};

const message = "p-10 text-gms-body text-gms-text-secondary";
const DENIED = "You don't have permission to view memo out returns.";

/** `/memo/memo-out-return` — a new memo out return. */
export function MemoOutReturnPage() {
  const access = useDocumentAccess("memo-out-return");
  if (!access) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{DENIED}</p>;
  return <DocumentForm config={CONFIG} canAdd={access.add} canEdit={access.edit} canDelete={access.delete} />;
}

/** `/memo/memo-out-return/[id]` — a saved memo out return. */
export function EditMemoOutReturnPage({ id }: { id: string }) {
  const access = useDocumentAccess("memo-out-return");
  const detail = useMemoOutReturnDetail(access?.view ? id : null);
  if (!access || (access.view && detail.isPending)) return <p className={message}>Loading…</p>;
  if (!access.view) return <p className={message}>{DENIED}</p>;
  if (detail.isError || !detail.data) return <p className={message}>{detail.error ? memoOutReturnLoadError(detail.error) : "Memo out return not found."}</p>;
  return <DocumentForm key={`${id}:${detail.data.version}`} config={CONFIG} initial={fromMemoOutReturn(detail.data)} canAdd={access.add} canEdit={access.edit} canDelete={access.delete} />;
}
