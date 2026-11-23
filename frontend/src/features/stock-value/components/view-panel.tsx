"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type RefObject } from "react";
import { cx, focusRing } from "@/components/ui/button";
import { ColumnSwitch } from "@/features/memo-outstanding-vendor/components/customize-view-panel";
import { hideAllColumns, LOCKED_COLUMNS, setColumnShown, showAllColumns, viewLists, type ViewColumn, type ViewPrefs } from "../view-prefs";

type PanelProps = {
  open: boolean;
  prefs: ViewPrefs;
  onChange: (prefs: ViewPrefs) => void;
  onClose: () => void;
  /** Toolbar button that gets focus back on close. */
  returnFocus: RefObject<HTMLButtonElement | null>;
};

/**
 * Customize view (Q-SV-22): a right-side panel like Stock Card's. Stone Code, the BALANCE columns and Profit/Loss are locked; Location, Lot No.,
 * the stone detail line, Unit and the price source line switch per browser. A native modal <dialog> traps focus; Escape or the
 * close button closes it and focus returns to the toolbar button.
 */
export function StockValueViewPanel({ open, prefs, onChange, onClose, returnFocus }: PanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const { shown, hidden } = viewLists(prefs);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      closeRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      returnFocus.current?.focus();
    }
  }, [open, returnFocus]);

  const toggle = (key: ViewColumn, show: boolean) => onChange(setColumnShown(prefs, key, show));
  const link = cx("rounded px-1 text-gms-body font-medium text-gms-primary disabled:cursor-not-allowed disabled:opacity-40", focusRing);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A press on the backdrop (outside the panel box) closes it.
        if (event.target === dialogRef.current) onClose();
      }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none w-[min(340px,100vw)] bg-gms-surface p-0 text-gms-text shadow-gms-overlay backdrop:bg-black/20 print:hidden"
    >
      <div className="flex h-full flex-col overflow-y-auto px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 id={titleId} className="text-gms-heading font-semibold">
            Customize view
          </h2>
          <button ref={closeRef} type="button" aria-label="Close" onClick={onClose} className={cx("inline-flex h-9 w-9 items-center justify-center rounded-full bg-gms-surface-sunken", focusRing)}>
            <X size={18} aria-hidden />
          </button>
        </div>
        <section aria-labelledby={`${titleId}-shown`}>
          <div className="flex items-center justify-between py-2">
            <h3 id={`${titleId}-shown`} className="text-gms-body text-gms-text-secondary">
              Shown in table
            </h3>
            <button type="button" className={link} disabled={shown.length === 0} onClick={() => onChange(hideAllColumns())}>
              Hide all
            </button>
          </div>
          <ul>
            {LOCKED_COLUMNS.map((name, index) => (
              <ColumnSwitch key={name} id={`${titleId}-locked-${index}`} label={name} checked locked />
            ))}
            {shown.map((column) => (
              <ColumnSwitch key={column.key} id={`${titleId}-${column.key}`} label={column.label} checked onToggle={() => toggle(column.key, false)} />
            ))}
          </ul>
        </section>
        <section aria-labelledby={`${titleId}-hidden`} className="mt-2 border-t border-gms-border pt-2">
          <div className="flex items-center justify-between py-2">
            <h3 id={`${titleId}-hidden`} className="text-gms-body text-gms-text-secondary">
              Hidden in table
            </h3>
            <button type="button" className={link} disabled={hidden.length === 0} onClick={() => onChange(showAllColumns())}>
              Show all
            </button>
          </div>
          <ul>
            {hidden.length === 0 && <li className="py-1.5 text-gms-label text-gms-text-secondary">No hidden columns</li>}
            {hidden.map((column) => (
              <ColumnSwitch key={column.key} id={`${titleId}-${column.key}`} label={column.label} checked={false} onToggle={() => toggle(column.key, true)} />
            ))}
          </ul>
        </section>
      </div>
    </dialog>
  );
}
