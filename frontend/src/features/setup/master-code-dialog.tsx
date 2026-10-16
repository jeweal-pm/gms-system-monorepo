"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { masterCodeDestinations } from "./setup-destinations";
import { SetupTileLink } from "./setup-tile";

/**
 * Master Code modal (N-12, S4): native `<dialog>` + `showModal()` (inert background, Tab stays
 * inside, top layer). White title above a 662 px white card on the `gms-scrim` backdrop; 7 link tiles.
 * Closes on Escape, a click on the scrim outside the title/card, the focus-visible Close button
 * (DV-08), or when a tile starts a client navigation. `onClose(returnFocus)`: the opener restores focus
 * to the Master Code tile when no navigation happened.
 */
export function MasterCodeDialog({ open, onClose }: Readonly<{ open: boolean; onClose: (returnFocus: boolean) => void }>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const gridRef = useRef<HTMLUListElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      gridRef.current?.querySelector<HTMLElement>("a[href]")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose(true);
      }}
      // Closed by the browser (e.g. repeated Escape without user activation): keep state in sync.
      onClose={() => {
        if (open) onClose(true);
      }}
      onClick={(event) => {
        // Only the dialog box itself (outside the title/card wrapper) or the ::backdrop targets the dialog.
        if (event.target === event.currentTarget) onClose(true);
      }}
      className="m-auto max-h-none w-[min(662px,calc(100vw-32px))] max-w-none overflow-visible border-0 bg-transparent p-0 text-gms-text backdrop:bg-gms-scrim"
    >
      <div className="@container flex max-h-[calc(100dvh-32px)] flex-col items-center gap-6">
        <h2 id={titleId} className="shrink-0 text-lg leading-[26px] font-normal text-gms-on-primary">
          Master Code
        </h2>
        <div className="relative min-h-0 w-full overflow-y-auto overscroll-contain rounded-gms-2xl bg-gms-surface px-[27px] pt-[31px] pb-8 shadow-gms-overlay md:min-h-[473px]">
          <ul ref={gridRef} className="grid grid-cols-2 gap-y-6 @min-[480px]:grid-cols-3 @min-[640px]:grid-cols-4">
            {masterCodeDestinations.map((destination) => (
              <li key={destination.id} className="flex justify-center">
                <SetupTileLink variant="modal" href={destination.href} label={destination.label} icon={destination.icon} color={destination.color} onNavigate={() => onClose(false)} />
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => onClose(true)}
            // Visually hidden until it receives keyboard focus (DV-08); always in the accessibility tree.
            className="pointer-events-none absolute top-4 right-4 flex size-8 items-center justify-center rounded-gms-md bg-gms-nav-active text-gms-text opacity-0 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gms-primary"
          >
            <X aria-hidden size={18} strokeWidth={1.5} />
            <span className="sr-only">Close</span>
          </button>
        </div>
      </div>
    </dialog>
  );
}
