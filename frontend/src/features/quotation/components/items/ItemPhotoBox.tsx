"use client";

import { ImagePlus, X } from "lucide-react";
import { useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { MAX_LINE_PHOTOS, type PhotoRef, type QuotationFormValues } from "../../schema";
import { cx } from "../ui";

/** รูป + note ของแถวที่เลือกอยู่ — TODO: upload ขึ้น storage จริง (ตอนนี้เป็น object URL ในเครื่อง) */
export function ItemPhotoBox({ index, readOnly }: { index: number | null; readOnly: boolean }) {
  const { control, setValue } = useFormContext<QuotationFormValues>();
  const lines = useWatch({ control, name: "lines" });
  const line = index === null ? undefined : lines[index];
  const inputRef = useRef<HTMLInputElement>(null);

  const photos = line?.photos ?? [];
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
    setPhotos([...photos, ...added]);
  };

  return (
    <div className="w-[270px] shrink-0 rounded-xl border border-[#E3E6EA] p-3">
      {photos.length === 0 ? (
        <button
          type="button"
          disabled={!canAdd}
          onClick={() => inputRef.current?.click()}
          className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-4 rounded-lg bg-[#F6F7F8] text-sm text-[#6B7480] disabled:cursor-not-allowed"
        >
          <span className="flex size-12 items-center justify-center rounded-full border-2 border-dashed border-[#A9B1B9]">
            {canAdd && <ImagePlus className="size-5" />}
          </span>
          {line ? "Add up to 4 photos" : "Select a row to add photos"}
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg bg-[#F6F7F8]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.name} className="size-full object-cover" />
              {!readOnly && (
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => setPhotos(photos.filter((x) => x.id !== p.id))}
                  className="absolute top-1 right-1 hidden rounded-full bg-black/60 p-1 text-white group-hover:block"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          ))}
          {canAdd && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={cx("flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-[#D5DADF] text-[#6B7480]")}
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
      <p className="mt-4 text-xs font-medium text-[#1C252E]">Item Note</p>
      <p className="mt-1 text-xs break-words text-[#6B7480]">{line?.itemNote || "-"}</p>
    </div>
  );
}
