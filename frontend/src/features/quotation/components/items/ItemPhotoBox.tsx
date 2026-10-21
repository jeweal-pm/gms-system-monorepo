"use client";

import { ChevronLeft, ChevronRight, Crown, ImagePlus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { MAX_LINE_PHOTOS, type PhotoRef, type QuotationFormValues } from "../../schema";
import { cx, IconButton } from "../ui";

/**
 * รูปของแถวที่เลือก: เลื่อนดูทีละรูป (1…4), ตั้งรูปหลักด้วยมงกุฎ (รูปหลัก = photos[0]), เพิ่ม/ลบรูป
 * TODO: upload ขึ้น storage จริง (ตอนนี้เป็น object URL ในเครื่อง)
 */
export function ItemPhotoBox({ index, readOnly }: { index: number | null; readOnly: boolean }) {
  const { control, setValue } = useFormContext<QuotationFormValues>();
  const lines = useWatch({ control, name: "lines" });
  const line = index === null ? undefined : lines[index];
  const photos = line?.photos ?? [];
  const inputRef = useRef<HTMLInputElement>(null);
  // เปลี่ยนแถว → กลับไปรูปแรก (รูปหลัก)
  const [view, setView] = useState({ key: "", index: 0 });
  const current = view.key === line?.key ? view.index : 0;
  const setCurrent = (i: number) => setView({ key: line?.key ?? "", index: i });
  const shown = Math.min(current, Math.max(0, photos.length - 1));
  const photo = photos[shown];
  const canAdd = !readOnly && line !== undefined && photos.length < MAX_LINE_PHOTOS;

  const setPhotos = (next: PhotoRef[]) => {
    if (index !== null) setValue(`lines.${index}.photos`, next, { shouldDirty: true });
  };

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    const added = [...files]
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, MAX_LINE_PHOTOS - photos.length)
      .map((f) => ({ id: crypto.randomUUID(), name: f.name, url: URL.createObjectURL(f) }));
    if (added.length === 0) return;
    setPhotos([...photos, ...added]);
    setCurrent(photos.length);
  };

  const remove = (id: string) => {
    const target = photos.find((p) => p.id === id);
    if (target) URL.revokeObjectURL(target.url);
    setPhotos(photos.filter((p) => p.id !== id));
  };

  const setMain = (id: string) => {
    const target = photos.find((p) => p.id === id);
    if (!target) return;
    setPhotos([target, ...photos.filter((p) => p.id !== id)]);
    setCurrent(0);
  };

  const go = (step: number) => setCurrent((shown + step + photos.length) % photos.length);

  return (
    <div className="w-[300px] shrink-0 overflow-hidden rounded-xl border border-[#E3E6EA] bg-white">
      <header className="flex items-start justify-between gap-2 border-b border-[#EEF0F2] px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[#1C252E]">{line?.stoneCode || line?.stockId || (line ? "New item" : "No row selected")}</p>
          <p className="text-xs text-[#6B7480]">{photos.length ? `Photo · ${shown + 1} / ${photos.length}` : `Up to ${MAX_LINE_PHOTOS} photos`}</p>
        </div>
        {photo && !readOnly && (
          <IconButton label="Remove photo" onClick={() => remove(photo.id)}>
            <Trash2 className="size-4" />
          </IconButton>
        )}
      </header>

      <div className="relative flex aspect-square items-center justify-center bg-[#F8F8F8]">
        {photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={photo.name} className="max-h-full max-w-full object-contain" />
            <button
              type="button"
              aria-label={shown === 0 ? "Main photo" : "Set as main photo"}
              title={shown === 0 ? "Main photo" : "Set as main photo"}
              disabled={readOnly || shown === 0}
              onClick={() => setMain(photo.id)}
              className={cx(
                "absolute top-3 right-3 rounded-full p-1.5",
                shown === 0 ? "text-[#F5A524]" : "bg-white/80 text-[#95A0A9] hover:text-[#F5A524]",
              )}
            >
              <Crown className="size-5" fill={shown === 0 ? "currentColor" : "none"} />
            </button>
            {photos.length > 1 && (
              <>
                <IconButton label="Previous photo" onClick={() => go(-1)} className="absolute top-1/2 left-2 -translate-y-1/2 bg-white/70">
                  <ChevronLeft className="size-5" />
                </IconButton>
                <IconButton label="Next photo" onClick={() => go(1)} className="absolute top-1/2 right-2 -translate-y-1/2 bg-white/70">
                  <ChevronRight className="size-5" />
                </IconButton>
              </>
            )}
          </>
        ) : (
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => inputRef.current?.click()}
            className="flex size-full flex-col items-center justify-center gap-4 text-sm text-[#6B7480] disabled:cursor-not-allowed"
          >
            <span className="flex size-12 items-center justify-center rounded-full border-2 border-dashed border-[#A9B1B9]">
              {canAdd && <ImagePlus className="size-5" />}
            </span>
            {line ? `Add up to ${MAX_LINE_PHOTOS} photos` : "Select a row to add photos"}
          </button>
        )}
      </div>

      {photos.length > 0 && (
        <div className="flex gap-2 border-t border-[#EEF0F2] p-3">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              aria-label={`Show photo ${i + 1}`}
              onClick={() => setCurrent(i)}
              className={cx(
                "relative size-14 overflow-hidden rounded-lg border-2 bg-[#F8F8F8]",
                i === shown ? "border-[#0E5E63]" : "border-transparent",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="size-full object-cover" />
              {i === 0 && <Crown className="absolute top-0.5 right-0.5 size-3 text-[#F5A524]" fill="currentColor" />}
            </button>
          ))}
          {canAdd && (
            <button
              type="button"
              aria-label="Add photo"
              onClick={() => inputRef.current?.click()}
              className="flex size-14 items-center justify-center rounded-lg border-2 border-dashed border-[#D5DADF] text-[#6B7480] hover:border-[#A9B1B9]"
            >
              <ImagePlus className="size-5" />
            </button>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="border-t border-[#EEF0F2] px-4 py-3">
        <p className="text-xs font-medium text-[#1C252E]">Item Note</p>
        <p className="mt-1 text-xs break-words text-[#6B7480]">{line?.itemNote || "-"}</p>
      </div>
    </div>
  );
}
