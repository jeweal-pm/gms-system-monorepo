"use client";

import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gms-primary";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "danger";

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-gms-primary text-gms-on-primary hover:bg-gms-primary-strong",
  secondary: "border border-gms-border bg-gms-surface text-gms-text hover:bg-gms-surface-sunken",
  danger: "bg-gms-danger-button text-gms-on-primary hover:brightness-95",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  ref?: Ref<HTMLButtonElement>;
};

export function Button({ variant = "secondary", icon, loading = false, loadingLabel, disabled, className, children, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-gms-md px-4 text-[15px] font-medium transition-colors disabled:cursor-not-allowed",
        loading ? "" : "disabled:opacity-40",
        variantClass[variant],
        focusRing,
        className,
      )}
      {...props}
    >
      {loading ? <LoaderCircle size={18} className="animate-spin" aria-hidden /> : icon}
      {loading ? (loadingLabel ?? children) : children}
    </button>
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode; ref?: Ref<HTMLButtonElement> };

/** Icon-only button: accessible name plus a native tooltip. */
export function IconButton({ label, className, children, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex h-9 w-9 items-center justify-center rounded-gms-md text-gms-text transition-colors hover:bg-gms-surface-sunken disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
        focusRing,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
