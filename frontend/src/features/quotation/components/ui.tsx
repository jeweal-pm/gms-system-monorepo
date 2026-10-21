"use client";

// Primitive เฉพาะ feature นี้ — ถ้าโปรเจกต์มี design system กลางอยู่แล้ว ให้เปลี่ยนไปใช้ของกลางแทน
import { ChevronDown, X } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

/* Tokens (จาก Figma) */
export const tone = {
  text: "text-[#1C252E]",
  muted: "text-[#6B7480]",
  subtle: "text-[#95A0A9]",
  border: "border-[#E3E6EA]",
};

type ButtonVariant = "primary" | "secondary" | "dark" | "danger" | "danger-outline" | "ghost";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-[#0E5E63] text-white hover:bg-[#0B4D51] disabled:bg-[#7FB3B5]",
  secondary: "border border-[#E3E6EA] bg-white text-[#1C252E] hover:bg-[#F6F7F8] disabled:text-[#B5BCC3]",
  dark: "bg-[#1C252E] text-white hover:bg-black",
  danger: "bg-[#E5484D] text-white hover:bg-[#CE3B40] disabled:bg-[#F3A5A7]",
  "danger-outline": "border border-[#E5484D] bg-white text-[#E5484D] hover:bg-[#FFF1F1]",
  ghost: "text-[#1C252E] hover:bg-[#F3F4F5]",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed",
        size === "md" ? "h-10 px-5 text-sm" : "h-8 px-3 text-[13px]",
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function IconButton({ className, label, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-8 items-center justify-center rounded-lg text-[#1C252E] hover:bg-[#F3F4F5] disabled:cursor-not-allowed disabled:text-[#B5BCC3]",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  required,
  error,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cx("relative block", className)}>
      <span className="absolute -top-2 left-3 z-10 bg-white px-1 text-xs font-medium text-[#1C252E]">
        {label}
        {required && <span className="text-[#E5484D]"> *</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-[#E5484D]">{error}</span>}
    </label>
  );
}

const controlClass =
  "h-12 w-full rounded-lg border border-[#E3E6EA] bg-white px-4 text-[15px] text-[#1C252E] outline-none placeholder:text-[#A9B1B9] focus:border-[#0E5E63] focus:ring-2 focus:ring-[#0E5E63]/15 disabled:bg-[#F6F7F8] disabled:text-[#6B7480] read-only:bg-[#F6F7F8]";

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { compact?: boolean }>(
  function TextInput({ className, compact, ...props }, ref) {
    return <input ref={ref} className={cx(controlClass, compact && "h-10 px-3 text-sm", className)} {...props} />;
  },
);

export const SelectInput = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string; compact?: boolean }
>(function SelectInput({ options, placeholder = "Select", className, compact, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cx(controlClass, "appearance-none pr-10", compact && "h-10 px-3 text-sm", className)}
        {...props}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-[#1C252E]" />
    </div>
  );
});

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }>(
  function Checkbox({ label, className, ...props }, ref) {
    return (
      <label className={cx("inline-flex cursor-pointer items-center gap-3 text-[15px] text-[#1C252E]", className)}>
        <input
          ref={ref}
          type="checkbox"
          className="size-5 cursor-pointer rounded border-[#D5DADF] accent-[#0E5E63] disabled:cursor-not-allowed"
          {...props}
        />
        {label}
      </label>
    );
  },
);

export function Badge({ children, variant = "neutral" }: { children: ReactNode; variant?: "neutral" | "lot" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded px-1.5 py-0.5 text-xs",
        variant === "lot" ? "bg-[#FDF1DC] font-mono text-[#B4540A]" : "bg-[#EEF0F2] font-medium text-[#1C252E]",
      )}
    >
      {children}
    </span>
  );
}

export function SidePanel({
  title,
  subtitle,
  onClose,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("flex flex-col overflow-hidden rounded-2xl border border-[#E3E6EA] bg-white shadow-xl", className)}>
      <header className="flex items-start justify-between border-b border-[#E3E6EA] px-5 py-5">
        <div>
          <h2 className="text-lg font-medium text-[#1C252E]">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-[#6B7480]">{subtitle}</p>}
        </div>
        <IconButton label="Close" onClick={onClose} className="rounded-full bg-[#F6F7F8]">
          <X className="size-4" />
        </IconButton>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      role="status"
      className="fixed top-16 right-6 z-50 flex items-center gap-4 rounded-lg bg-[#1C2B33] px-5 py-3 text-sm font-medium text-white shadow-lg"
    >
      {message}
      <button type="button" aria-label="Dismiss" onClick={onClose}>
        <X className="size-4" />
      </button>
    </div>
  );
}
