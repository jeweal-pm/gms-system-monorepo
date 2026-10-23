"use client";

import { Check, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "./button";

export type ToastTone = "success" | "info" | "warning" | "error";
/** Optional text action at the right of the card (the design's "Settings"). */
export type ToastAction = { label: string; onClick: () => void };
export type ToastItem = { id: number; tone: ToastTone; message: string; action?: ToastAction };
type ToastApi = { show: (tone: ToastTone, message: string, action?: ToastAction) => void };

const MAX_TOASTS = 3;
/** Proposal pending Q-UP-24: success/info/warning dismiss after 5 s; errors stay until closed. */
const AUTO_DISMISS_MS = 5_000;

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}

/** C-18: stack at the top right (owner 2026-10-22, was top-center) inside a polite live region; never takes focus. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const show = useCallback((tone: ToastTone, message: string, action?: ToastAction) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, tone, message, action }].slice(-MAX_TOASTS));
  }, []);
  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed right-4 top-[100px] z-50 flex w-[min(350px,calc(100vw-32px))] flex-col items-stretch gap-2 sm:right-6"
      >
        {toasts.map((toast) => <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />)}
      </div>
    </ToastContext.Provider>
  );
}

const toastFocusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gms-toast-text";

/**
 * Tone mark (owner design 2026-10-20): info is a 24 px dark square with a white "i"; the others are a
 * 20 px coloured disc on a 32 px tinted halo, with the glyph cut out in the halo colour.
 */
export function ToastMark({ tone }: { tone: ToastTone }) {
  if (tone === "info") {
    return (
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center">
        <span className="flex size-6 items-center justify-center rounded-gms-sm bg-gms-toast-info text-[13px] leading-none font-bold text-white">i</span>
      </span>
    );
  }
  const halo = tone === "success" ? "bg-gms-toast-success-halo text-gms-toast-success-halo" : "bg-gms-toast-alert-halo text-gms-toast-alert-halo";
  const disc = tone === "success" ? "bg-gms-toast-success" : tone === "error" ? "bg-gms-toast-error" : "bg-gms-toast-warning";
  return (
    <span aria-hidden className={cx("flex size-8 shrink-0 items-center justify-center rounded-full", halo)}>
      <span className={cx("flex size-5 items-center justify-center rounded-full", disc)}>
        {tone === "success" ? <Check size={13} strokeWidth={3} /> : <span className="text-[13px] leading-none font-extrabold">!</span>}
      </span>
    </span>
  );
}

export function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (toast.tone === "error") return;
    const timer = window.setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss, toast.id, toast.tone]);

  return (
    <div
      role={toast.tone === "error" || toast.tone === "warning" ? "alert" : "status"}
      data-tone={toast.tone}
      className="pointer-events-auto flex min-h-14 items-center gap-3 rounded-gms-md bg-gms-toast py-3 pr-3 pl-4 text-gms-toast-text shadow-gms-overlay"
    >
      <ToastMark tone={toast.tone} />
      <p className="min-w-0 flex-1 text-gms-body leading-5 font-semibold">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
          className={cx("shrink-0 rounded-gms-sm px-1 text-gms-body leading-5 hover:underline", toastFocusRing)}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)} className={cx("shrink-0 rounded-gms-sm p-1 hover:bg-white/10", toastFocusRing)}>
        <X size={20} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}
