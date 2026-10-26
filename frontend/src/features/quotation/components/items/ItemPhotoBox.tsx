"use client";

import { ChevronLeft, ChevronRight, Crown, ImageOff, Search, X, ZoomIn } from "lucide-react";
import { useEffect, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import type { PhotoRef, QuotationFormValues } from "../../schema";
import { cx, IconButton } from "../ui";

/**
 * Photos of the selected row, view only (owner 2026-10-26): browse one by one and open a larger view.
 * Adding, removing and choosing the main photo happen in the row panel (LinePhotosField).
 */
export function ItemPhotoBox({ index }: { index: number | null }) {
  const { control } = useFormContext<QuotationFormValues>();
  const lines = useWatch({ control, name: "lines" });
  const line = index === null ? undefined : lines[index];
  const photos = line?.photos ?? [];
  // A different row starts again at its main (first) photo.
  const [view, setView] = useState({ key: "", index: 0 });
  const [zoomed, setZoomed] = useState(false);
  const [lens, setLens] = useState<{ x: number; y: number } | null>(null);
  const current = view.key === line?.key ? view.index : 0;
  const shown = Math.min(current, Math.max(0, photos.length - 1));
  const photo = photos[shown];
  const title = line?.stoneCode || line?.stockId || (line ? "New item" : "No row selected");
  const go = (step: number) => setView({ key: line?.key ?? "", index: (shown + step + photos.length) % photos.length });

  return (
    <div className="w-[300px] shrink-0 overflow-hidden rounded-xl border border-[#E3E6EA] bg-white">
      <header className="border-b border-[#EEF0F2] px-4 py-3">
        <p className="truncate text-sm font-medium text-[#1C252E]">{title}</p>
        <p className="text-xs text-[#6B7480]">{photos.length ? `Photo · ${shown + 1} / ${photos.length}` : "No photos"}</p>
      </header>

      <div className="relative flex aspect-square items-center justify-center bg-[#F8F8F8]">
        {photo ? (
          <>
            {/* Owner 2026-10-26 (Figma): the whole photo opens the larger view; a magnifier follows the
                pointer, drawn behind the crown and the < > buttons so those stay clickable. */}
            <button
              type="button"
              aria-label="View larger"
              onClick={() => setZoomed(true)}
              onMouseMove={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                setLens({ x: event.clientX - box.left, y: event.clientY - box.top });
              }}
              onMouseLeave={() => setLens(null)}
              className="absolute inset-0 z-0 flex cursor-zoom-in items-center justify-center"
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
              <ZoomIn aria-hidden className="absolute right-3 bottom-3 size-4 text-[#1C252E]" />
            </button>
            {shown === 0 && <Crown aria-label="Main photo" className="pointer-events-none absolute top-3 right-3 z-10 size-5 text-[#F5A524]" fill="currentColor" />}
            {photos.length > 1 && <ArrowButtons onPrev={() => go(-1)} onNext={() => go(1)} />}
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 text-center text-sm text-[#6B7480]">
            <ImageOff className="size-8 text-[#A9B1B9]" />
            {line ? "Add photos in the row panel" : "Select a row to see its photos"}
          </div>
        )}
      </div>

      <div className="border-t border-[#EEF0F2] px-4 py-3">
        <p className="text-xs font-medium text-[#1C252E]">Item Note</p>
        <p className="mt-1 text-xs break-words text-[#6B7480]">{line?.itemNote || "-"}</p>
      </div>

      {zoomed && photo && (
        <PhotoLightbox title={title} photos={photos} index={shown} onIndexChange={(i) => setView({ key: line?.key ?? "", index: i })} onClose={() => setZoomed(false)} />
      )}
    </div>
  );
}

function ArrowButtons({ onPrev, onNext, large = false }: { onPrev: () => void; onNext: () => void; large?: boolean }) {
  const size = large ? "size-6" : "size-5";
  return (
    <>
      <IconButton label="Previous photo" onClick={onPrev} className="absolute top-1/2 left-2 z-10 -translate-y-1/2 bg-white/70">
        <ChevronLeft className={size} />
      </IconButton>
      <IconButton label="Next photo" onClick={onNext} className="absolute top-1/2 right-2 z-10 -translate-y-1/2 bg-white/70">
        <ChevronRight className={size} />
      </IconButton>
    </>
  );
}

/** Larger view (Figma "Side view · 1 / 3"); Escape closes, arrow keys browse. */
function PhotoLightbox({ title, photos, index, onIndexChange, onClose }: { title: string; photos: PhotoRef[]; index: number; onIndexChange: (index: number) => void; onClose: () => void }) {
  const photo = photos[index];
  const go = (step: number) => onIndexChange((index + step + photos.length) % photos.length);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && photos.length > 1) onIndexChange((index - 1 + photos.length) % photos.length);
      if (event.key === "ArrowRight" && photos.length > 1) onIndexChange((index + 1) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onClose, onIndexChange]);

  return (
    <div role="dialog" aria-modal="true" aria-label={`${title} photos`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div className="flex max-h-full w-full max-w-[720px] flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-[#EEF0F2] px-5 py-4">
          <div className="min-w-0">
            <p className="truncate font-medium text-[#1C252E]">{title}</p>
            <p className="text-xs text-[#6B7480]">{photo?.name ? `${photo.name} · ` : ""}{index + 1} / {photos.length}</p>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-5" />
          </IconButton>
        </header>
        <div className={cx("relative flex min-h-[360px] flex-1 items-center justify-center bg-[#F8F8F8] p-6")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photo && <img src={photo.url} alt={photo.name} className="max-h-[70vh] max-w-full object-contain" />}
          {index === 0 && <Crown aria-label="Main photo" className="absolute top-4 right-4 size-6 text-[#F5A524]" fill="currentColor" />}
          {photos.length > 1 && <ArrowButtons onPrev={() => go(-1)} onNext={() => go(1)} large />}
        </div>
      </div>
    </div>
  );
}
