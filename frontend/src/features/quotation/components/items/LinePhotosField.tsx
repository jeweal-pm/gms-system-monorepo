"use client";

import { Crown, Plus, X } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { PhotoUploadError, PHOTO_TYPES } from "../../api";
import { useDocumentKind } from "../../document-kind";
import { MAX_LINE_PHOTOS, type PhotoRef, type QuotationFormValues } from "../../schema";
import { cx } from "../ui";

/**
 * Row panel photos (owner 2026-10-26, Figma row panel): add up to 5 photos by button or drag and drop,
 * set the main photo (the first one, crown) and remove photos. Uploads go straight to the quotation
 * photo route (SA-QT-10) and are kept permanently; removing only unlinks a photo from the row.
 */
export function LinePhotosField({ index, readOnly }: { index: number; readOnly: boolean }) {
  const { control, setValue } = useFormContext<QuotationFormValues>();
  const { uploadPhoto } = useDocumentKind();
  const photos = useWatch({ control, name: `lines.${index}.photos` }) ?? [];
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const canAdd = !readOnly && !uploading && photos.length < MAX_LINE_PHOTOS;

  const setPhotos = (next: PhotoRef[]) => setValue(`lines.${index}.photos`, next, { shouldDirty: true });

  const addFiles = async (files: File[]) => {
    const picked = files.slice(0, MAX_LINE_PHOTOS - photos.length);
    if (picked.length === 0) return;
    setUploading(true);
    setError(null);
    const added: PhotoRef[] = [];
    try {
      for (const file of picked) {
        added.push(await uploadPhoto(file));
      }
    } catch (cause) {
      setError(cause instanceof PhotoUploadError ? cause.message : "Couldn't upload the photo. Try again.");
    } finally {
      setUploading(false);
    }
    if (added.length > 0) setPhotos([...photos, ...added]);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (canAdd) void addFiles([...event.dataTransfer.files]);
  };

  const setMain = (id: string) => {
    const target = photos.find((photo) => photo.id === id);
    if (target) setPhotos([target, ...photos.filter((photo) => photo.id !== id)]);
  };

  const remove = (id: string) => setPhotos(photos.filter((photo) => photo.id !== id));
  const openPicker = () => inputRef.current?.click();

  const dropProps = {
    onDragOver: (event: DragEvent) => {
      event.preventDefault();
      if (canAdd) setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop,
  };

  const tile = "relative flex aspect-square items-center justify-center overflow-hidden rounded-xl border bg-[#F8F8F8]";
  const [main, ...rest] = photos;
  const emptySlots = Math.max(0, MAX_LINE_PHOTOS - 1 - rest.length);

  return (
    <div>
      <div className="grid grid-cols-[2fr_1fr_1fr] gap-2">
        {/* Large first tile: the main photo, or the drop zone while there are no photos. */}
        <div className="row-span-2" {...dropProps}>
          {main ? (
            <PhotoTile photo={main} isMain readOnly={readOnly} onSetMain={setMain} onRemove={remove} className={cx(tile, "h-full border-[#E3E6EA]")} />
          ) : (
            <div className={cx(tile, "h-full flex-col gap-3 border-dashed px-3 text-center", dragging ? "border-[#0E5E63] bg-[#E6F1F1]" : "border-[#D5DADF]")}>
              <button type="button" disabled={!canAdd} onClick={openPicker} className="rounded-lg bg-[#EEF0F2] px-4 py-2 text-sm font-medium text-[#1C252E] disabled:cursor-not-allowed disabled:opacity-60">
                {uploading ? "Uploading…" : "Add files"}
              </button>
              <p className="text-xs text-[#6B7480]">Drag and drop images here.<br />Up to {MAX_LINE_PHOTOS} photos per item (JPEG/PNG, 5 MB).</p>
            </div>
          )}
        </div>
        {rest.map((photo) => (
          <PhotoTile key={photo.id} photo={photo} readOnly={readOnly} onSetMain={setMain} onRemove={remove} className={cx(tile, "border-[#E3E6EA]")} />
        ))}
        {Array.from({ length: emptySlots }, (_, i) => (
          <button
            key={`slot-${i}`}
            type="button"
            aria-label="Add photo"
            disabled={!canAdd}
            onClick={openPicker}
            {...dropProps}
            className={cx(tile, "border-[#EEF0F2] text-[#6B7480] hover:border-[#A9B1B9] disabled:cursor-not-allowed disabled:hover:border-[#EEF0F2]")}
          >
            <Plus className="size-5" />
          </button>
        ))}
      </div>
      {uploading && main && <p className="mt-2 text-xs text-[#6B7480]">Uploading…</p>}
      {error && <p role="alert" className="mt-2 text-xs text-[#E5484D]">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_TYPES.join(",")}
        multiple
        hidden
        onChange={(event) => {
          void addFiles([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function PhotoTile({
  photo,
  isMain = false,
  readOnly,
  onSetMain,
  onRemove,
  className,
}: {
  photo: PhotoRef;
  isMain?: boolean;
  readOnly: boolean;
  onSetMain: (id: string) => void;
  onRemove: (id: string) => void;
  className: string;
}) {
  return (
    <div className={cx(className, "group")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt={photo.name} className="size-full object-contain" />
      <button
        type="button"
        aria-label={isMain ? "Main photo" : "Set as main photo"}
        title={isMain ? "Main photo" : "Set as main photo"}
        disabled={readOnly || isMain}
        onClick={() => onSetMain(photo.id)}
        className={cx(
          "absolute top-1.5 left-1.5 rounded-full p-1",
          isMain ? "text-[#F5A524]" : "bg-white/80 text-[#95A0A9] opacity-0 group-hover:opacity-100 hover:text-[#F5A524] focus:opacity-100",
        )}
      >
        <Crown className="size-4" fill={isMain ? "currentColor" : "none"} />
      </button>
      {!readOnly && (
        <button
          type="button"
          aria-label="Remove photo"
          onClick={() => onRemove(photo.id)}
          className="absolute top-1.5 right-1.5 rounded-full bg-white/90 p-1 text-[#6B7480] opacity-0 group-hover:opacity-100 hover:text-[#E5484D] focus:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
