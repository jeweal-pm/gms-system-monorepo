"use client";

import { ChevronLeft, ChevronRight, Search, X, ZoomIn } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { CrownIcon } from "@/components/ui/crown-icon";
import { useLinePhotoTarget } from "../../options-context";
import type { PhotoRef, QuotationFormValues } from "../../schema";
import { IconButton } from "../ui";

/**
 * Photos of the selected row, view only (owner 2026-10-26): browse one by one and open a larger view. Adding, removing
 * and choosing the main photo happen in the row panel (LinePhotosField). Design (owner 2026-10-31): no title row; the
 * photo sits in a light grey rounded area with plain < > arrows, a zoom button bottom-right and a crown on the main
 * photo; an empty area is dashed with "Add up to 5 photos"; Item Note below. The larger view opens beside the card.
 */
export function ItemPhotoBox({ index }: { index: number | null }) {
  const { control } = useFormContext<QuotationFormValues>();
  const lines = useWatch({ control, name: "lines" });
  const canAdd = useLinePhotoTarget().upload !== null;
  const line = index === null ? undefined : lines[index];
  const photos = line?.photos ?? [];
  // A different row starts again at its main (first) photo.
  const [view, setView] = useState({ key: "", index: 0 });
  const [zoomed, setZoomed] = useState(false);
  const [lens, setLens] = useState<{ x: number; y: number } | null>(null);
  const current = view.key === line?.key ? view.index : 0;
  const shown = Math.min(current, Math.max(0, photos.length - 1));
  const photo = photos[shown];
  const title = line?.stoneCode || line?.stockId || "New item";
  const go = (step: number) => setView({ key: line?.key ?? "", index: (shown + step + photos.length) % photos.length });

  return (
    <div className="relative w-[300px] shrink-0">
      <div className="rounded-xl border border-[#E3E6EA] bg-white p-3">
        {photo ? (
          <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-[#EEF0F2] bg-[#F8F8F8]">
            {/* Owner 2026-10-26 (Figma): the whole photo opens the larger view; a magnifier follows the pointer, drawn
                behind the crown and the < > buttons so those stay clickable. It replaces the system pointer (owner
                2026-10-31: no second, Windows zoom cursor on top of it), so the photo hides the cursor. */}
            <button
              type="button"
              aria-label="View larger"
              onClick={() => setZoomed(true)}
              onMouseMove={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                setLens({ x: event.clientX - box.left, y: event.clientY - box.top });
              }}
              onMouseLeave={() => setLens(null)}
              className="absolute inset-0 z-0 flex cursor-none items-center justify-center px-10 py-6"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={photo.name} className="max-h-full max-w-full object-contain" />
              {lens && (
                <span
                  aria-hidden
                  style={{ left: lens.x, top: lens.y }}
                  className="pointer-events-none absolute flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#1C252E] shadow-md"
                >
                  <Search className="size-5" />
                </span>
              )}
            </button>
            {shown === 0 && <CrownIcon aria-label="Main photo" className="pointer-events-none absolute top-2.5 right-2.5 z-10 size-5 text-[#FFAB00]" />}
            {photos.length > 1 && <ArrowButtons onPrev={() => go(-1)} onNext={() => go(1)} />}
            <IconButton label="Zoom in" onClick={() => setZoomed(true)} className="absolute right-2.5 bottom-2.5 z-10 size-8 bg-white shadow-sm">
              <ZoomIn className="size-4" />
            </IconButton>
          </div>
        ) : (
          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-[#E3E6EA] bg-[#F8F8F8] px-6 text-center text-sm text-[#6B7480]">
            <span aria-hidden className="size-12 rounded-full border-2 border-dashed border-[#A9B1B9]" />
            {canAdd ? "Add up to 5 photos" : "No photos"}
          </div>
        )}

        <div className="px-1 pt-3 pb-1">
          <p className="text-sm font-medium text-[#1C252E]">Item Note</p>
          <p className="mt-1 text-sm break-words text-[#A9B1B9]">{line?.itemNote || "-"}</p>
        </div>
      </div>

      {zoomed && photo && (
        <PhotoViewer title={title} photos={photos} index={shown} onIndexChange={(i) => setView({ key: line?.key ?? "", index: i })} onClose={() => setZoomed(false)} />
      )}
    </div>
  );
}

function ArrowButtons({ onPrev, onNext, large = false }: { onPrev: () => void; onNext: () => void; large?: boolean }) {
  const size = large ? "size-6" : "size-5";
  return (
    <>
      <IconButton label="Previous photo" onClick={onPrev} className="absolute top-1/2 left-1.5 z-10 -translate-y-1/2">
        <ChevronLeft className={size} />
      </IconButton>
      <IconButton label="Next photo" onClick={onNext} className="absolute top-1/2 right-1.5 z-10 -translate-y-1/2">
        <ChevronRight className={size} />
      </IconButton>
    </>
  );
}

/**
 * Larger view (design: "AL-LBUDEXVS1AAA · Side view · 1 / 3"). It opens as a panel beside the photo card, over the
 * table, without dimming the page. Escape, the close button or a click outside closes it; arrow keys browse.
 */
function PhotoViewer({ title, photos, index, onIndexChange, onClose }: { title: string; photos: PhotoRef[]; index: number; onIndexChange: (index: number) => void; onClose: () => void }) {
  const photo = photos[index];
  const panelRef = useRef<HTMLDivElement>(null);
  const go = (step: number) => onIndexChange((index + step + photos.length) % photos.length);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && photos.length > 1) onIndexChange((index - 1 + photos.length) % photos.length);
      if (event.key === "ArrowRight" && photos.length > 1) onIndexChange((index + 1) % photos.length);
    };
    const onDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [index, photos.length, onClose, onIndexChange]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`${title} photos`}
      className="absolute -top-11 left-full z-40 ml-4 flex w-[560px] flex-col overflow-hidden rounded-xl border border-[#E3E6EA] bg-white shadow-xl"
    >
      <header className="flex items-start justify-between gap-4 border-b border-[#EEF0F2] px-6 py-4">
        <div className="min-w-0">
          <p className="truncate font-medium text-[#1C252E]">{title}</p>
          {/* Owner 2026-10-31: the design's wording, "Side view · 2 / 3". */}
          <p className="mt-0.5 text-sm text-[#6B7480]">Side view · {index + 1} / {photos.length}</p>
        </div>
        <IconButton label="Close" onClick={onClose}>
          <X className="size-5" />
        </IconButton>
      </header>
      <div className="relative flex aspect-square items-center justify-center bg-[#F8F8F8] px-14 py-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo && <img src={photo.url} alt={photo.name} className="max-h-full max-w-full object-contain" />}
        {index === 0 && <CrownIcon aria-label="Main photo" className="absolute top-4 right-4 size-6 text-[#FFAB00]" />}
        {photos.length > 1 && <ArrowButtons onPrev={() => go(-1)} onNext={() => go(1)} large />}
      </div>
    </div>
  );
}
