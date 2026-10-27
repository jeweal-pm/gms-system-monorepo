"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Search } from "lucide-react";
import { Fragment, useState } from "react";
import { Button, cx } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ToastProvider, useToast } from "@/components/ui/toast";
import type { PartnerAccess } from "@/features/partner/access";
import { DiscardChangesDialog } from "@/features/partner/components/discard-changes-dialog";
import { DetailLoadError, PartnerAccessGuard } from "@/features/partner/components/partner-page-parts";
import { useUnsavedChangesPrompt } from "@/features/partner/hooks";
import { getDecimalSetup, saveDecimalSetup } from "./api";
import { applyToAll, DECIMAL_CHOICES, differsFromDefaults, exampleText, filterPages, type DecimalSetup } from "./pages";

/**
 * Gate (Q-DEC-05): there is no `decimal-setup` permission yet, so the page reuses `document-setup`
 * (VIEW to open, EDIT to change) until the API adds its own leaf.
 */
export const DECIMAL_SETUP_ENTITY = { key: "document-setup", singular: "Decimal Setup", plural: "Decimal Setups" };
const QUERY_KEY = ["decimal-setup"] as const;
const SEARCH_MAX = 50;

/** Setup › Decimal Setup (decimal-setup UI rev 1, owner 2026-10-27): mock data only. */
export function DecimalSetupPage() {
  return (
    <ToastProvider>
      <PartnerAccessGuard entity={DECIMAL_SETUP_ENTITY}>{(access) => <DecimalSetupWorkspace access={access} />}</PartnerAccessGuard>
    </ToastProvider>
  );
}

function DecimalSetupWorkspace({ access }: { access: PartnerAccess }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const saved = useQuery({ queryKey: QUERY_KEY, queryFn: getDecimalSetup, staleTime: Infinity });
  const [draft, setDraft] = useState<DecimalSetup | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [confirmApply, setConfirmApply] = useState(false);
  const [pendingDiscard, setPendingDiscard] = useState(false);

  const editing = draft !== null;
  const shown = draft ?? saved.data;
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(saved.data);
  useUnsavedChangesPrompt(dirty);

  const update = (change: (setup: DecimalSetup) => DecimalSetup) => setDraft((current) => (current ? change(current) : current));

  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    try {
      queryClient.setQueryData(QUERY_KEY, await saveDecimalSetup(draft));
      setDraft(null);
      toast.show("success", "Decimal setup saved");
    } finally {
      setSaving(false);
    }
  }

  function applyDefaults() {
    if (draft && differsFromDefaults(draft)) setConfirmApply(true);
    else update(applyToAll);
  }

  const rows = filterPages(query);

  return (
    <div className="flex h-full min-h-0 flex-col bg-gms-page">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
            <h1 className="text-gms-title font-medium text-gms-text-heading">Decimal Setup</h1>
            <span className="text-gms-body text-gms-text-secondary">Weight and price decimal places per page</span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <Button onClick={() => (dirty ? setPendingDiscard(true) : setDraft(null))} disabled={!editing || saving} className="h-[38px] min-w-[100px]">
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void save()} loading={saving} loadingLabel="Saving..." disabled={!editing} className="h-[38px] min-w-[100px]">
              Save
            </Button>
            <Button
              variant="primary"
              icon={<Pencil size={16} aria-hidden />}
              onClick={() => saved.data && setDraft(structuredClone(saved.data))}
              disabled={!access.edit || editing || !saved.data}
              className="h-[38px] min-w-[100px]"
            >
              Edit
            </Button>
          </div>
        </div>

        {saved.isError && <DetailLoadError message="Couldn't load the decimal setup." onRetry={() => void saved.refetch()} />}
        {saved.isPending && <div aria-busy="true" aria-label="Loading decimal setup" className="h-[320px] animate-pulse rounded-gms-lg bg-gms-surface-sunken" />}

        {shown && (
          <div className="flex flex-col gap-4">
            <p role="note" className="rounded-gms-md border border-gms-border bg-gms-surface-muted px-4 py-3 text-gms-body text-gms-text-secondary">
              Preview: these settings are kept in this browser only and are not used by other pages yet.
            </p>

            <Card title="Default" titleId="decimal-default-title" titleClassName="text-gms-heading font-medium text-gms-text">
              <div className="flex flex-wrap items-end gap-4">
                <PlacesField id="default-weight" label="Weight decimals" value={shown.defaults.weight} kind="weight" disabled={!editing}
                  onChange={(weight) => update((s) => ({ ...s, defaults: { ...s.defaults, weight } }))} />
                <PlacesField id="default-price" label="Price decimals" value={shown.defaults.price} kind="price" disabled={!editing}
                  onChange={(price) => update((s) => ({ ...s, defaults: { ...s.defaults, price } }))} />
                {editing && (
                  <Button onClick={applyDefaults} className="h-[38px]">
                    Apply to all pages
                  </Button>
                )}
              </div>
              <p className="mt-3 text-gms-label text-gms-text-secondary">Used by Apply to all pages. Pieces are always whole numbers.</p>
            </Card>

            <Card
              title="Decimal Places by Page"
              titleId="decimal-pages-title"
              titleClassName="text-gms-heading font-medium text-gms-text"
              trailing={
                <label className="relative block w-full max-w-[260px]">
                  <span className="sr-only">Search page</span>
                  <Search size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gms-text-secondary" />
                  <input
                    type="search"
                    value={query}
                    maxLength={SEARCH_MAX}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search page..."
                    className="h-9 w-full rounded-gms-md border border-gms-border bg-gms-surface pr-3 pl-9 text-gms-body text-gms-text outline-none focus:border-gms-primary"
                  />
                </label>
              }
            >
              {rows.length === 0 ? (
                <p className="py-6 text-center text-gms-body text-gms-text-secondary">{`No pages match "${query.trim()}"`}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-gms-body">
                    <caption className="sr-only">Decimal places by page</caption>
                    <thead className="text-gms-label text-gms-text-secondary">
                      <tr className="border-b border-gms-border">
                        <th scope="col" className="py-2 pr-3 font-medium">Page</th>
                        <th scope="col" className="px-3 py-2 font-medium">Weight (ct)</th>
                        <th scope="col" className="px-3 py-2 font-medium">Example</th>
                        <th scope="col" className="px-3 py-2 font-medium">Price</th>
                        <th scope="col" className="px-3 py-2 font-medium">Example</th>
                      </tr>
                    </thead>
                    <tbody aria-live={editing ? "polite" : undefined}>
                      {rows.map((page, index) => {
                        const places = shown.pages[page.key];
                        const newSection = index === 0 || rows[index - 1].section !== page.section;
                        return (
                          <Fragment key={page.key}>
                            {newSection && (
                              <tr>
                                <th scope="rowgroup" colSpan={5} className="pt-4 pb-1 text-gms-label font-medium tracking-wide text-gms-text-secondary">{page.section}</th>
                              </tr>
                            )}
                            <tr className="border-b border-gms-border last:border-b-0">
                              <th scope="row" className="py-2 pr-3 font-normal text-gms-text">{page.label}</th>
                              <td className="px-3 py-2">
                                {places.weight === null ? (
                                  <span className="text-gms-text-secondary">—</span>
                                ) : (
                                  <PlacesSelect label={`${page.label} weight decimals`} value={places.weight} disabled={!editing}
                                    onChange={(weight) => update((s) => ({ ...s, pages: { ...s.pages, [page.key]: { ...s.pages[page.key], weight } } }))} />
                                )}
                              </td>
                              <td className="px-3 py-2 tabular-nums text-gms-text-secondary">{places.weight === null ? "" : exampleText("weight", places.weight)}</td>
                              <td className="px-3 py-2">
                                <PlacesSelect label={`${page.label} price decimals`} value={places.price} disabled={!editing}
                                  onChange={(price) => update((s) => ({ ...s, pages: { ...s.pages, [page.key]: { ...s.pages[page.key], price } } }))} />
                              </td>
                              <td className="px-3 py-2 tabular-nums text-gms-text-secondary">{exampleText("price", places.price)}</td>
                            </tr>
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmApply}
        title="Apply the defaults to all pages?"
        body="Some pages use different decimal places. They will all be set to the default weight and price decimals."
        cancelLabel="Keep page settings"
        confirmLabel="Apply to all"
        pendingLabel="Applying..."
        pending={false}
        onCancel={() => setConfirmApply(false)}
        onConfirm={() => {
          update(applyToAll);
          setConfirmApply(false);
        }}
      />
      <DiscardChangesDialog
        entity={DECIMAL_SETUP_ENTITY}
        open={pendingDiscard}
        name="the decimal setup"
        onKeep={() => setPendingDiscard(false)}
        onDiscard={() => {
          setPendingDiscard(false);
          setDraft(null);
        }}
      />
    </div>
  );
}

function PlacesSelect({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (value: number) => void }) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
      className={cx(
        "h-9 w-20 rounded-gms-md border px-2 text-gms-body",
        disabled ? "border-gms-border bg-gms-field-disabled text-gms-text" : "border-gms-border bg-gms-surface text-gms-text focus:border-gms-primary",
      )}
    >
      {DECIMAL_CHOICES.map((choice) => (
        <option key={choice} value={choice}>
          {choice}
        </option>
      ))}
    </select>
  );
}

function PlacesField({ id, label, value, kind, disabled, onChange }: { id: string; label: string; value: number; kind: "weight" | "price"; disabled: boolean; onChange: (value: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-gms-label font-medium text-gms-text">{label}</label>
      <div className="flex items-center gap-3">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          className={cx("h-[38px] w-24 rounded-gms-md border border-gms-border px-2 text-gms-body text-gms-text", disabled ? "bg-gms-field-disabled" : "bg-gms-surface focus:border-gms-primary")}
        >
          {DECIMAL_CHOICES.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
        <span className="tabular-nums text-gms-label text-gms-text-secondary">{exampleText(kind, value)}</span>
      </div>
    </div>
  );
}
