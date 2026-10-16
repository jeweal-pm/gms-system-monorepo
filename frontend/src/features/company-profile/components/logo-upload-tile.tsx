"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { cx, focusRing } from "@/components/ui/button";
import { LOGO_TYPES, logoFileError, type LogoChange } from "../schema";

type LogoUploadTileProps = {
  id: string;
  value: LogoChange;
  /** URL of the saved logo (FE-CP-009); null when none is saved. */
  savedUrl: string | null;
  onChange: (value: LogoChange) => void;
  readOnly: boolean;
};

const tileSize = "size-32";

/**
 * CP-07 Company Logo (S1, S4–S6; owner answers Q-CP-03/04): empty upload tile; uploaded logo on a
 * grey tile in view mode; on a white tile with a trash button in edit mode. JPEG/PNG up to 10 MB,
 * checked when picked (the server checks again). Replacing or removing revokes the old preview URL.
 */
export function LogoUploadTile({ id, value, savedUrl, onChange, readOnly }: LogoUploadTileProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const src = value.kind === "new" ? value.previewUrl : value.kind === "removed" ? null : savedUrl;
  const errorId = `${id}-error`;

  function replace(next: LogoChange) {
    if (value.kind === "new") URL.revokeObjectURL(value.previewUrl);
    onChange(next);
  }

  function pick(file: File | undefined) {
    if (!file) return;
    const problem = logoFileError(file);
    setError(problem);
    if (problem) return;
    replace({ kind: "new", file, previewUrl: URL.createObjectURL(file) });
  }

  function remove() {
    setError(null);
    replace(savedUrl ? { kind: "removed" } : { kind: "unchanged" });
    inputRef.current?.focus();
  }

  const input = (
    <input
      ref={inputRef}
      id={id}
      type="file"
      accept={LOGO_TYPES.join(",")}
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

  if (src && readOnly) {
    return (
      <div className={cx(tileSize, "flex items-center justify-center overflow-hidden rounded-gms-lg bg-gms-checkbox-readonly outline-1 outline-gms-border outline-dashed")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- blob/same-origin logo of unknown size; next/image adds nothing here */}
        <img src={src} alt="Company logo" className="size-full object-cover" />
      </div>
    );
  }

  if (src) {
    return (
      <div>
        <div className={cx(tileSize, "relative rounded-gms-lg bg-gms-surface outline-1 outline-gms-border outline-dashed")}>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            aria-label="Replace company logo, JPEG or PNG up to 10 MB"
            aria-describedby={error ? errorId : undefined}
            className={cx("flex size-full items-center justify-center overflow-hidden rounded-gms-lg", focusRing)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
            <img src={src} alt="" className="size-full object-cover" />
          </button>
          <button
            type="button"
            onClick={remove}
            aria-label="Remove company logo"
            className={cx("absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-gms-surface-sunken text-gms-danger hover:brightness-95", focusRing)}
          >
            <Trash2 size={16} strokeWidth={1.75} aria-hidden />
          </button>
          {input}
        </div>
        {error && (
          <p id={errorId} className="mt-1 text-gms-label italic text-gms-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={readOnly}
        aria-label={readOnly ? "No company logo" : "Upload company logo, JPEG or PNG up to 10 MB"}
        aria-describedby={error ? errorId : undefined}
        className={cx(
          tileSize,
          "flex flex-col items-center justify-center gap-1 rounded-gms-lg bg-gms-upload-tile text-center shadow-gms-tile outline-1 outline-offset-2 outline-gms-border outline-dashed transition-colors enabled:hover:brightness-[0.98] disabled:cursor-default",
          focusRing,
        )}
      >
        <ImagePlus size={28} strokeWidth={1.5} className="mb-1 text-gms-text" aria-hidden />
        <span className="text-gms-label font-semibold text-gms-text">{readOnly ? "No logo" : "Upload photo"}</span>
        {!readOnly && <span className="text-gms-label text-gms-text-secondary">JPEG or PNG only</span>}
      </button>
      {input}
      {error && (
        <p id={errorId} className="mt-1 text-gms-label italic text-gms-danger">
          {error}
        </p>
      )}
    </div>
  );
}
