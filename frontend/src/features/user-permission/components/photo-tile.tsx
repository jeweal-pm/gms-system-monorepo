"use client";

import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { cx, focusRing } from "@/components/ui/button";
import { PHOTO_TYPES, photoFileError, type PhotoChange } from "../photo";

type PhotoTileProps = {
  value: PhotoChange;
  /** Versioned URL of the saved photo; null when none is saved (or on a new draft). */
  savedUrl: string | null;
  onChange: (value: PhotoChange) => void;
  readOnly: boolean;
  /** The picked photo is being uploaded after Save: dimmed with a spinner, not interactive. */
  uploading?: boolean;
};

const tileSize = "h-[120px] w-[120px] shrink-0";

/**
 * C-08 Photo tile (FE-UP-013, user-photo.md): empty upload tile, saved photo in view mode, and in
 * create/edit the photo with a trash button. JPEG/PNG up to 5 MB, checked when picked (the server
 * checks again). The file uploads after Save (PH-08). Replacing or removing revokes the old preview URL.
 */
export function PhotoTile({ value, savedUrl, onChange, readOnly, uploading = false }: PhotoTileProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const src = value.kind === "new" ? value.previewUrl : value.kind === "removed" ? null : savedUrl;
  const errorId = "user-photo-error";

  function replace(next: PhotoChange) {
    if (value.kind === "new") URL.revokeObjectURL(value.previewUrl);
    onChange(next);
  }

  function pick(file: File | undefined) {
    if (!file) return;
    const problem = photoFileError(file);
    setError(problem);
    if (problem) return;
    replace({ kind: "new", file, previewUrl: URL.createObjectURL(file) });
  }

  function remove() {
    setError(null);
    replace(savedUrl ? { kind: "removed" } : { kind: "unchanged" });
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={PHOTO_TYPES.join(",")}
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(event) => {
        pick(event.target.files?.[0]);
        // Allow picking the same file again after an error or removal.
        event.target.value = "";
      }}
    />
  );
  const errorText = error && (
    <p id={errorId} role="alert" className="mt-1 w-[120px] text-gms-label italic text-gms-danger">
      {error}
    </p>
  );

  if (src && (readOnly || uploading)) {
    return (
      <div aria-busy={uploading || undefined} className={cx(tileSize, "relative overflow-hidden rounded-gms-md bg-gms-checkbox-readonly shadow-gms-tile")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- blob/same-origin photo of unknown size; next/image adds nothing here */}
        <img src={src} alt="User photo" className="size-full object-cover" />
        {uploading && (
          <span role="status" className="absolute inset-0 flex items-center justify-center bg-black/30">
            <LoaderCircle size={28} strokeWidth={1.5} className="animate-spin text-gms-surface" aria-hidden />
            <span className="sr-only">Uploading photo</span>
          </span>
        )}
      </div>
    );
  }

  if (src) {
    return (
      <div>
        <div className={cx(tileSize, "relative rounded-gms-md bg-gms-surface shadow-gms-tile")}>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            aria-label="Replace photo, JPEG or PNG up to 5 MB"
            aria-describedby={error ? errorId : undefined}
            className={cx("size-full overflow-hidden rounded-gms-md", focusRing)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
            <img src={src} alt="" className="size-full object-cover" />
          </button>
          <button
            type="button"
            onClick={remove}
            aria-label="Remove photo"
            className={cx("absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-gms-surface-sunken text-gms-danger hover:brightness-95", focusRing)}
          >
            <Trash2 size={16} strokeWidth={1.75} aria-hidden />
          </button>
          {input}
        </div>
        {errorText}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={readOnly}
        aria-label={readOnly ? "No photo" : "Upload photo, JPEG or PNG up to 5 MB"}
        aria-describedby={error ? errorId : undefined}
        className={cx(
          tileSize,
          "flex flex-col items-center justify-center gap-1 rounded-gms-md bg-gms-upload-tile text-center shadow-gms-tile transition-colors enabled:hover:brightness-[0.98] disabled:cursor-default",
          focusRing,
        )}
      >
        <ImagePlus size={28} strokeWidth={1.5} className="mb-1 text-gms-text" aria-hidden />
        <span className="text-gms-label font-semibold text-gms-text">{readOnly ? "No photo" : "Upload photo"}</span>
        {!readOnly && <span className="text-gms-label text-gms-text-secondary">JPEG or PNG only</span>}
      </button>
      {input}
      {errorText}
    </div>
  );
}
