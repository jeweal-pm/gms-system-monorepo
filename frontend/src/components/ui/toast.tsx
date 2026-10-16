"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cx, focusRing } from "./button";

export type ToastTone = "success" | "info" | "error";
type ToastItem = { id: number; tone: ToastTone; message: string };
type ToastApi = { show: (tone: ToastTone, message: string) => void };

const MAX_TOASTS = 3;
/** Proposal pending Q-UP-24: success/info dismiss after 5 s; errors stay until closed. */
const AUTO_DISMISS_MS = 5_000;

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}

/** C-18: top-center stack inside a polite live region; never takes focus. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const show = useCallback((tone: ToastTone, message: string) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, tone, message }].slice(-MAX_TOASTS));
  }, []);
  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed left-1/2 top-[100px] z-50 flex w-[min(616px,calc(100vw-32px))] -translate-x-1/2 flex-col gap-2"
      >
        {toasts.map((toast) => <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />)}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (toast.tone === "error") return;
    const timer = window.setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss, toast.id, toast.tone]);

  const Icon = toast.tone === "success" ? CircleCheck : toast.tone === "error" ? CircleAlert : Info;
  return (
    <div role={toast.tone === "error" ? "alert" : "status"} className="pointer-events-auto flex items-start gap-4 rounded-gms-lg border border-gms-border bg-gms-surface px-5 py-3 shadow-gms-overlay">
      <Icon
        size={22}
        aria-hidden
        className={cx("mt-0.5 shrink-0", toast.tone === "success" ? "text-gms-success" : toast.tone === "error" ? "text-gms-danger" : "text-gms-primary")}
      />
      <p className="min-w-0 flex-1 text-gms-body leading-[22px] text-gms-text">{toast.message}</p>
      <button type="button" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)} className={cx("shrink-0 rounded-gms-sm p-1 text-gms-text hover:bg-gms-surface-sunken", focusRing)}>
        <X size={18} aria-hidden />
      </button>
    </div>
  );
}
