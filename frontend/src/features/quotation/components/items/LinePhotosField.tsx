"use client";

import { GripVertical, Plus, X } from "lucide-react";
import { CrownIcon } from "@/components/ui/crown-icon";
import { useRef, useState, type DragEvent } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { PhotoUploadError, PHOTO_TYPES } from "../../api";
import { useDocumentKind } from "../../document-kind";
import { useLinePhotoTarget } from "../../options-context";
import { MAX_LINE_PHOTOS, type PhotoRef, type QuotationFormValues } from "../../schema";
import { cx } from "../ui";
import { animateRemoval, usePhotoMotion } from "./photo-motion";

/** Tile border: a fine dotted line (owner design 2026-11-10). */
const DOTTED = "border-[#C4CDD5]";

/** Marks a drag that moves a photo inside the row (not files from the computer). */
export const PHOTO_DRAG_TYPE = "application/x-gms-line-photo";

/** Moves a photo to slot `to`; slot 0 is the main photo (crown). Unknown ids leave the list unchanged. */
export function movePhoto(photos: readonly PhotoRef[], id: string, to: number): PhotoRef[] {
  const from = photos.findIndex((photo) => photo.id === id);
  if (from < 0) return [...photos];
  const next = photos.filter((photo) => photo.id !== id);
  next.splice(Math.min(Math.max(to, 0), next.length), 0, photos[from]);
  return next;
}

/**
 * Row panel photos (owner 2026-10-26, Figma row panel): add up to 5 photos by button or drag and drop,
 * set the main photo (the first one, crown) and remove photos. Owner 2026-11-04: photos can also be dragged
 * between tiles; dropping one on the first tile makes it the main photo. Uploads go straight to the quotation
 * photo route (SA-QT-10) and are kept permanently; removing only unlinks a photo from the row.
 */
export function LinePhotosField({ index, readOnly }: { index: number; readOnly: boolean }) {
  const { control, setValue, getValues } = useFormContext<QuotationFormValues>();
  const { uploadPhoto } = useDocumentKind();
  const photos = useWatch({ control, name: `lines.${index}.photos` }) ?? [];
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The slot under the pointer while files or a photo are dragged over it.
  const [overSlot, setOverSlot] = useState<number | null>(null);
  // The photo being dragged: lifted for one frame (the browser's drag image), then faded while it moves.
  const [drag, setDrag] = useState<{ id: string; lifted: boolean } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  usePhotoMotion(gridRef, photos.map((photo) => photo.id), photos[0]?.id, index);
  // The document kind's photo route (Quotation, Memo Receive rev 4), or none yet on memo out / memo out return.
  const upload = useLinePhotoTarget().upload ? uploadPhoto : null;
  const canAdd = Boolean(upload) && !readOnly && !uploading && photos.length < MAX_LINE_PHOTOS;

  const setPhotos = (next: PhotoRef[]) => setValue(`lines.${index}.photos`, next, { shouldDirty: true });

  const addFiles = async (files: File[]) => {
    const picked = files.slice(0, MAX_LINE_PHOTOS - photos.length);
    if (picked.length === 0) return;
    setUploading(true);
    setError(null);
    const added: PhotoRef[] = [];
    try {
      for (const file of picked) {
        if (!upload) break;
        added.push(await upload(file));
      }
    } catch (cause) {
      setError(cause instanceof PhotoUploadError ? cause.message : "Couldn't upload the photo. Try again.");
    } finally {
      setUploading(false);
    }
    if (added.length > 0) setPhotos([...photos, ...added]);
  };

  const setMain = (id: string) => {
    const target = photos.find((photo) => photo.id === id);
    if (target) setPhotos([target, ...photos.filter((photo) => photo.id !== id)]);
  };

  // The tile zooms out first; the list is read again afterwards so nothing changed meanwhile is lost.
  const remove = (id: string) =>
    animateRemoval(gridRef.current, id, () => setPhotos((getValues(`lines.${index}.photos`) ?? []).filter((photo) => photo.id !== id)));
  const startDrag = (id: string) => {
    setDrag({ id, lifted: true });
    requestAnimationFrame(() => setDrag((current) => (current?.id === id ? { id, lifted: false } : current)));
  };
  const endDrag = () => {
    setDrag(null);
    setOverSlot(null);
  };
  const dragPhase = (id: string) => (drag?.id === id ? (drag.lifted ? "lift" : "dragging") : undefined);
  const openPicker = () => inputRef.current?.click();

  // A photo dropped on a slot moves there; files dropped on any slot are uploaded (when there is room).
  // The default is always prevented so a dropped file never opens in the browser.
  const dropProps = (slot: number) => ({
    onDragOver: (event: DragEvent) => {
      event.preventDefault();
      const moving = event.dataTransfer.types.includes(PHOTO_DRAG_TYPE);
      const allowed = moving ? !readOnly : canAdd;
      event.dataTransfer.dropEffect = allowed ? (moving ? "move" : "copy") : "none";
      setOverSlot(allowed ? slot : null);
    },
    onDragLeave: () => setOverSlot((current) => (current === slot ? null : current)),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      // The drop can move the dragged photo to another place in the tree (a small tile becomes the main one), so the
      // element that started the drag is gone before its dragend fires: end the drag here (owner 2026-11-10: the new
      // main photo stayed faded at the "dragging" opacity).
      endDrag();
      const id = event.dataTransfer.getData(PHOTO_DRAG_TYPE);
      if (id) {
        const next = movePhoto(photos, id, slot);
        if (!readOnly && next.some((photo, i) => photo.id !== photos[i]?.id)) setPhotos(next);
        return;
      }
      if (canAdd) void addFiles([...event.dataTransfer.files]);
    },
  });

  // Owner design 2026-11-10: white tiles with a fine dotted border; the photo sits smaller in the middle.
  const tileBase = "flex items-center justify-center overflow-hidden rounded-lg border border-dotted bg-white";
  // Small tiles: square from the column width (never from a height), so they can't grow past their column.
  const tile = cx(tileBase, "relative aspect-square w-full");
  // The main tile spans two rows (2 × tile + the 8 px row gap): a square would be 8 px wider than its column and
  // cover the column gap (owner 2026-11-10), so it fills its own grid area instead.
  // Absolutely placed in its two-row area, so neither it nor its photo can change the row height.
  const mainTile = cx(tileBase, "absolute inset-0");
  const [main, ...rest] = photos;
  const emptySlots = Math.max(0, MAX_LINE_PHOTOS - 1 - rest.length);

  return (
    <div>
      {/* minmax(0, …): a large photo can't widen its column past the panel (owner 2026-11-10: photos overflowed). */}
      <div ref={gridRef} className="grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2.5">
        {/* Large first tile: the main photo, or the drop zone while there are no photos. */}
        <div className="relative row-span-2 min-w-0" {...dropProps(0)}>
          {main ? (
            <PhotoTile
              // Keyed by photo: a new main photo gets its own element, never the removed one (still faded out).
              key={main.id}
              photo={main}
              isMain
              readOnly={readOnly}
              over={overSlot === 0}
              dragPhase={dragPhase(main.id)}
              onSetMain={setMain}
              onRemove={remove}
              onDragStart={startDrag}
              onDragEnd={endDrag}
              className={cx(mainTile, DOTTED)}
            />
          ) : (
            <div className={cx(mainTile, "flex-col gap-3 px-3 text-center transition-colors", overSlot === 0 ? "border-[#0E5E63] bg-[#E6F1F1]" : DOTTED)}>
              <button type="button" disabled={!canAdd} onClick={openPicker} className="rounded-lg bg-[#EEF0F2] px-4 py-2 text-sm font-medium text-[#1C252E] transition-[background-color,transform] enabled:hover:bg-[#DCE2E2] enabled:active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none">
                {uploading ? "Uploading…" : "Add files"}
              </button>
              <p className="text-xs text-[#6B7480]">Drag and drop images here.<br />Up to {MAX_LINE_PHOTOS} photos per item (JPEG/PNG, 5 MB).</p>
            </div>
          )}
        </div>
        {rest.map((photo, i) => (
          <div key={photo.id} className="min-w-0" {...dropProps(i + 1)}>
            <PhotoTile
              photo={photo}
              readOnly={readOnly}
              over={overSlot === i + 1}
              dragPhase={dragPhase(photo.id)}
              onSetMain={setMain}
              onRemove={remove}
              onDragStart={startDrag}
              onDragEnd={endDrag}
              className={cx(tile, DOTTED)}
            />
          </div>
        ))}
        {Array.from({ length: emptySlots }, (_, i) => (
          <button
            key={`slot-${i}`}
            type="button"
            aria-label="Add photo"
            disabled={!canAdd}
            onClick={openPicker}
            {...dropProps(photos.length + i)}
            className={cx(
              tile,
              "group/add border-[#C4CDD5] text-[#6B7480] transition-colors enabled:hover:border-[#0E5E63] enabled:hover:bg-[#E6F1F1] enabled:hover:text-[#0E5E63] disabled:cursor-not-allowed motion-reduce:transition-none",
              overSlot === photos.length + i && "border-[#0E5E63] bg-[#E6F1F1]",
            )}
          >
            {/* The plus turns a quarter on hover (PhotoGrid sample). */}
            <Plus className="size-5 transition-transform duration-[250ms] ease-[cubic-bezier(.2,.8,.2,1)] group-enabled/add:group-hover/add:rotate-90 motion-reduce:transition-none" />
          </button>
        ))}
      </div>
      {uploading && main && <p className="mt-2 text-xs text-[#6B7480]">Uploading…</p>}
      {error && <p role="alert" className="mt-2 text-xs text-[#E5484D]">{error}</p>}
      {!upload && <p className="mt-2 text-xs text-[#6B7480]">Photos for this document come in a later update.</p>}
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
  over,
  dragPhase,
  onSetMain,
  onRemove,
  onDragStart,
  onDragEnd,
  className,
}: {
  photo: PhotoRef;
  isMain?: boolean;
  readOnly: boolean;
  /** A photo or files are dragged over this tile. */
  over: boolean;
  /** This photo is being dragged: lifted for the drag image, then faded. */
  dragPhase?: "lift" | "dragging";
  onSetMain: (id: string) => void;
  onRemove: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  className: string;
}) {
  return (
    <div
      data-photo-id={photo.id}
      draggable={!readOnly}
      onDragStart={(event) => {
        event.dataTransfer.setData(PHOTO_DRAG_TYPE, photo.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart(photo.id);
      }}
      onDragEnd={onDragEnd}
      title={readOnly ? undefined : "Drag to reorder. The first photo is the main photo."}
      className={cx(
        className,
        "group transition-[transform,box-shadow,opacity] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none",
        !readOnly && "cursor-grab active:cursor-grabbing",
        over && "gms-photo-over",
        dragPhase === "lift" && "z-10 scale-[1.03] shadow-[0_12px_28px_rgba(16,40,40,.22)]",
        dragPhase === "dragging" && "scale-[.96] opacity-35",
      )}
    >
      {/* Out of flow, so a large photo never sizes its tile; it fills the frame (owner 2026-11-11: object-cover). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={photo.name}
        draggable={false}
        className={cx(
          "absolute inset-0 size-full object-cover transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)] group-hover:scale-[1.04] motion-reduce:transition-none",
        )}
      />
      {/* Owner design 2026-11-10: on hover the photo darkens and its controls appear (editable rows only). */}
      {!readOnly && <span aria-hidden className="pointer-events-none absolute inset-0 bg-[#1C252E]/35 opacity-0 transition-opacity group-hover:opacity-100" />}
      {isMain && (
        // Owner 2026-11-10 (PhotoGrid sample): the main photo carries a "Default" badge at the top left, always shown.
        <span
          data-crown
          title="Default photo"
          className="pointer-events-none absolute top-1.5 left-1.5 z-[1] inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[#9A5B00] shadow-[0_1px_3px_rgba(0,0,0,.12)]"
        >
          <CrownIcon aria-hidden className="size-3.5 text-[#FFAB00]" />
          Default
        </span>
      )}
      {!readOnly && (
        // Drag handle on every photo, shown on hover (drag onto the first tile to make a photo the main one).
        <span aria-hidden className="pointer-events-none absolute top-1.5 right-1.5 flex size-6 items-center justify-center text-[#1C252E] opacity-0 transition-opacity group-hover:opacity-100">
          <GripVertical className="size-4" />
        </span>
      )}
      {!isMain && (
        // Keyboard users can still promote a photo: the button appears when it has keyboard focus.
        <button
          type="button"
          aria-label="Set as main photo"
          title="Set as main photo"
          disabled={readOnly}
          onClick={() => onSetMain(photo.id)}
          className="sr-only rounded-full bg-white/90 p-1 text-[#95A0A9] hover:text-[#FFAB00] focus:not-sr-only focus:absolute focus:bottom-1.5 focus:left-1.5"
        >
          <CrownIcon className="size-4" />
        </button>
      )}
      {!readOnly && (
        <button
          type="button"
          aria-label="Remove photo"
          onClick={() => onRemove(photo.id)}
          className={cx(
            "absolute rounded-full bg-white/90 p-1 text-[#6B7480] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[#E5484D] focus:opacity-100",
            // The Default badge keeps the main photo's top-left corner, so its remove button sits bottom-right.
            isMain ? "right-1.5 bottom-1.5" : "top-1.5 left-1.5",
          )}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
