"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { Button, cx } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { authTrpc } from "@/lib/auth-trpc";
import type { PartnerAccess } from "@/features/partner/access";
import { DiscardChangesDialog } from "@/features/partner/components/discard-changes-dialog";
import { DetailLoadError, FormErrorBanner, PartnerAccessGuard } from "@/features/partner/components/partner-page-parts";
import { useUnsavedChangesPrompt } from "@/features/partner/hooks";
import { draftFrom, lastUpdatedText, loadErrorMessage, mapSaveError, toSaveInput, type SaveOutcome } from "./api";
import { useDecimalSetupQuery, useSaveDecimalSetup } from "./number-format-provider";
import { choicesFor, exampleText, type DecimalDraft, type DecimalKind } from "./pages";

/** Gate (FE-DEC-103, Q-DEC-14): its own `decimal-setup` leaf — VIEW to open, EDIT to change. */
export const DECIMAL_SETUP_ENTITY = { key: "decimal-setup", singular: "Decimal Setup", plural: "Decimal Setups" };

/** Setup › Decimal Setup (decimal-setup UI rev 2, owner 2026-11-03): one Default for the whole website. */
export function DecimalSetupPage() {
  return (
    <ToastProvider>
      <PartnerAccessGuard entity={DECIMAL_SETUP_ENTITY}>{(access) => <DecimalSetupWorkspace access={access} />}</PartnerAccessGuard>
    </ToastProvider>
  );
}

/** Save stays off until a value differs from the loaded one (every save bumps the version, api-contract.md). */
export function isDraftDirty(draft: DecimalDraft | null, saved: { weightPlaces: number; pricePlaces: number } | undefined): boolean {
  return draft !== null && saved !== undefined && (draft.weightPlaces !== saved.weightPlaces || draft.pricePlaces !== saved.pricePlaces);
}

function DecimalSetupWorkspace({ access }: { access: PartnerAccess }) {
  const toast = useToast();
  const authUtils = authTrpc.useUtils();
  // The page always re-reads on open so Edit starts from the latest version; the provider shares the result.
  const saved = useDecimalSetupQuery({ refetchOnMount: "always" });
  const saveMutation = useSaveDecimalSetup();
  const [draft, setDraft] = useState<DecimalDraft | null>(null);
  const [formError, setFormError] = useState<SaveOutcome | null>(null);
  const [reloading, setReloading] = useState(false);
  const [pendingDiscard, setPendingDiscard] = useState(false);

  const setup = saved.data?.setup;
  const editing = draft !== null;
  const saving = saveMutation.isPending;
  const dirty = isDraftDirty(draft, setup);
  const shown = draft ?? (setup ? draftFrom(setup) : null);
  const updated = setup ? lastUpdatedText(setup) : null;
  useUnsavedChangesPrompt(dirty);

  function cancelEdit() {
    setDraft(null);
    setFormError(null);
  }

  function save() {
    if (!draft || !dirty || saving) return;
    setFormError(null);
    saveMutation.mutate(toSaveInput(draft), {
      onSuccess: () => {
        setDraft(null);
        toast.show("success", "Decimal setup saved");
      },
      onError: (error) => {
        const outcome = mapSaveError(error);
        setFormError(outcome);
        if (outcome.recheckAccess) void authUtils.permission.mine.invalidate();
      },
    });
  }

  /** Conflict Reload: the latest values replace the kept draft. */
  async function reloadLatest() {
    setReloading(true);
    try {
      await saved.refetch();
      setDraft(null);
      setFormError(null);
    } finally {
      setReloading(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-gms-page">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
            <h1 className="text-gms-title font-medium text-gms-text-heading">Decimal Setup</h1>
            <span className="text-gms-body text-gms-text-secondary">Weight and price decimal places for the whole website</span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <Button onClick={() => (dirty ? setPendingDiscard(true) : cancelEdit())} disabled={!editing || saving} className="h-[38px] min-w-[100px]">
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={saving} loadingLabel="Saving..." disabled={!dirty} className="h-[38px] min-w-[100px]">
              Save
            </Button>
            <Button
              variant="primary"
              icon={<Pencil size={16} aria-hidden />}
              onClick={() => setup && setDraft(draftFrom(setup))}
              disabled={!access.edit || editing || !setup}
              className="h-[38px] min-w-[100px]"
            >
              Edit
            </Button>
          </div>
        </div>

        {formError && (
          <div className="mb-4 max-w-[640px]">
            <FormErrorBanner message={formError.message} onReload={formError.conflict ? () => void reloadLatest() : undefined} reloading={reloading} />
          </div>
        )}
        {saved.isError && !setup && <DetailLoadError message={loadErrorMessage(saved.error)} onRetry={() => void saved.refetch()} />}
        {saved.isPending && <div aria-busy="true" aria-label="Loading decimal setup" className="h-[180px] max-w-[640px] animate-pulse rounded-gms-lg bg-gms-surface-sunken" />}

        {shown && (
          <Card title="Default" titleId="decimal-default-title" titleClassName="text-gms-heading font-medium text-gms-text" className="max-w-[640px]">
            <div className="flex flex-col gap-4" aria-live={editing ? "polite" : undefined}>
              <PlacesField id="decimal-weight" label="Weight (ct) decimals" kind="weight" value={shown.weightPlaces} disabled={!editing || saving}
                onChange={(weightPlaces) => setDraft((current) => (current ? { ...current, weightPlaces } : current))} />
              <PlacesField id="decimal-price" label="Price decimals" kind="price" value={shown.pricePlaces} disabled={!editing || saving}
                onChange={(pricePlaces) => setDraft((current) => (current ? { ...current, pricePlaces } : current))} />
            </div>
            <p className="mt-4 text-gms-label text-gms-text-secondary">
              Applies to every page. Pieces are always whole numbers; percentages and exchange rates keep their own decimals.
            </p>
            {updated && <p className="mt-2 text-gms-label text-gms-text-secondary">{updated}</p>}
          </Card>
        )}
      </div>

      <DiscardChangesDialog
        entity={DECIMAL_SETUP_ENTITY}
        open={pendingDiscard}
        name="the decimal setup"
        onKeep={() => setPendingDiscard(false)}
        onDiscard={() => {
          setPendingDiscard(false);
          cancelEdit();
        }}
      />
    </div>
  );
}

export function PlacesField({ id, label, kind, value, disabled, onChange }: { id: string; label: string; kind: DecimalKind; value: number; disabled: boolean; onChange: (value: number) => void }) {
  return (
    <div className="grid grid-cols-1 items-center gap-x-4 gap-y-1 sm:grid-cols-[180px_auto_1fr]">
      <label htmlFor={id} className="text-gms-label font-medium text-gms-text">{label}</label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className={cx("h-[38px] w-24 rounded-gms-md border border-gms-border px-2 text-gms-body text-gms-text", disabled ? "bg-gms-field-disabled" : "bg-gms-surface focus:border-gms-primary")}
      >
        {choicesFor(kind).map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
      <span className="tabular-nums text-gms-label text-gms-text-secondary">Example {exampleText(kind, value)}</span>
    </div>
  );
}
