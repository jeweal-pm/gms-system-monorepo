"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { cx, focusRing } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";

/**
 * Copy button inside the Stone Code field (owner 2026-10-19). Shows a check for 1.5 s after copying and
 * announces the result; disabled while there is no code.
 */
export function CopyCodeButton({ value }: { value: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setTimeout(() => setStatus("idle"), 1500);
    return () => window.clearTimeout(timer);
  }, [status]);

  const empty = value.trim() === "";
  return (
    <>
      <button
        type="button"
        onClick={() => void copyText(value.trim()).then((ok) => setStatus(ok ? "copied" : "failed"))}
        disabled={empty}
        aria-label={status === "copied" ? "Stone code copied" : "Copy stone code"}
        title={status === "failed" ? "Couldn't copy. Select the code and copy it manually." : "Copy stone code"}
        className={cx(
          "absolute right-2 top-[26px] flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-gms-sm transition-colors",
          empty ? "cursor-default text-gms-text-placeholder" : "text-gms-text-secondary hover:bg-gms-surface-sunken hover:text-gms-text",
          status === "copied" && "text-gms-primary hover:text-gms-primary",
          focusRing,
        )}
      >
        {status === "copied" ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
      </button>
      <span aria-live="polite" className="sr-only">
        {status === "copied" ? "Stone code copied" : status === "failed" ? "Couldn't copy the stone code" : ""}
      </span>
    </>
  );
}
