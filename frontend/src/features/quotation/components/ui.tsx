"use client";

// Primitive เฉพาะ feature นี้ — ถ้าโปรเจกต์มี design system กลางอยู่แล้ว ให้เปลี่ยนไปใช้ของกลางแทน
import { DateInput, isBeforeDate } from "@/components/ui/date-input";
import { Check, ChevronDown, X } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useController, useFormContext, useWatch, type FieldValues, type Path } from "react-hook-form";
import { sanitizeDecimal } from "../lib/number";
import { DUE_BEFORE_DOC_MESSAGE } from "../schema";

export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

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
  // Same label as the shared FieldShell (owner 2026-10-23/2026-10-29): transparent above the field's top border,
  // the control's own fill from the border line (8 px) down — read from the control (invalid / disabled /
  // read-only), so no colored strip or patch shows around the label in any state.
  return (
    <label className={cx("group/field relative block", className)}>
      <span
        className={cx(
          "absolute -top-2 left-3 z-10 px-1 text-gms-label font-medium leading-4",
          error ? "text-gms-danger" : "text-gms-text",
          "bg-[linear-gradient(to_bottom,transparent_8px,var(--color-gms-surface)_8px)]",
          "group-has-[[aria-invalid=true]]/field:bg-[linear-gradient(to_bottom,transparent_8px,var(--color-gms-danger-subtle)_8px)]",
          "group-has-[:disabled]/field:bg-[linear-gradient(to_bottom,transparent_8px,var(--color-gms-field-disabled)_8px)]",
          "group-has-[input:read-only]/field:bg-[linear-gradient(to_bottom,transparent_8px,var(--color-gms-field-disabled)_8px)]",
          "group-has-[[aria-readonly=true]]/field:bg-[linear-gradient(to_bottom,transparent_8px,var(--color-gms-field-disabled)_8px)]",
        )}
      >
        {label}
        {required && <span className="text-gms-danger"> *</span>}
      </span>
      {children}
      {error && <span className="mt-1 block pl-4 text-gms-label italic text-gms-danger">{error}</span>}
    </label>
  );
}

/** Shared field colors (fieldBoxClass / fieldFocusClass in components/ui/outlined-field.tsx); sizes stay as designed. */
const controlClass = cx(
  "h-12 w-full rounded-gms-md border border-gms-border bg-gms-surface px-4 text-[15px] text-gms-text transition-colors placeholder:text-gms-text-placeholder hover:border-gms-text-placeholder",
  "outline-none focus:border-gms-primary focus:ring-2 focus:ring-gms-primary/20",
  "disabled:cursor-not-allowed disabled:bg-gms-field-disabled disabled:text-gms-checkbox-readonly disabled:hover:border-gms-border",
  // Error look of the shared fields (fieldBoxClass): red border, light red fill; the Field label reads the same state.
  "aria-[invalid=true]:border-gms-danger aria-[invalid=true]:bg-gms-danger-subtle",
);
/**
 * Read-only look for inputs only: a <button> always matches :read-only, so this must not be in controlClass
 * (it made every enabled dropdown look disabled grey).
 */
const readOnlyInputClass = "read-only:cursor-default read-only:bg-gms-field-disabled read-only:hover:border-gms-border read-only:focus:border-gms-border read-only:focus:ring-0";

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { compact?: boolean }>(
  function TextInput({ className, compact, ...props }, ref) {
    return <input ref={ref} className={cx(controlClass, readOnlyInputClass, compact && "h-10 px-3 text-sm", className)} {...props} />;
  },
);

/**
 * ช่องตัวเลข: กรองตัวอักษรออกก่อนส่งให้ react-hook-form (ห้ามกรอกตัวอักษร)
 * @param decimals จำนวนทศนิยมสูงสุด (0 = จำนวนเต็ม)
 */
export const NumberInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { compact?: boolean; decimals?: number; suffix?: string }>(
  function NumberInput({ decimals = 2, onChange, className, suffix, ...props }, ref) {
    const input = (
      <TextInput
        ref={ref}
        inputMode={decimals === 0 ? "numeric" : "decimal"}
        autoComplete="off"
        className={cx("text-right tabular-nums", suffix && "pr-14", className)}
        onChange={(e) => {
          const clean = sanitizeDecimal(e.target.value, decimals);
          if (clean !== e.target.value) e.target.value = clean;
          onChange?.(e);
        }}
        {...props}
      />
    );
    if (!suffix) return input;
    // Owner 2026-10-27: the unit (%, currency code) sits inside the box.
    return (
      <div className="relative w-full">
        {input}
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[#6B7480]">{suffix}</span>
      </div>
    );
  },
);

/** กล่องสีเทาแสดงค่าอย่างเดียว (กรอกไม่ได้) */
export function ReadonlyBox({ value, placeholder = "—", compact }: { value?: string; placeholder?: string; compact?: boolean }) {
  return (
    <div
      aria-readonly="true"
      className={cx(
        "flex w-full cursor-not-allowed items-center rounded-gms-md border border-gms-border bg-gms-field-disabled px-4 text-[15px]",
        compact ? "h-10 px-3 text-sm" : "h-12",
        value ? "text-gms-text" : "text-gms-text-placeholder",
      )}
    >
      <span className="truncate">{value || placeholder}</span>
    </div>
  );
}

export type Option = { value: string; label: string };

/** Dropdown แบบ custom (ตามดีไซน์) — keyboard: ↑ ↓ Enter Esc */
export function SelectMenu({
  value,
  onChange,
  options,
  placeholder = "Select",
  disabled,
  compact,
  invalid,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly Option[];
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const openMenu = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const choose = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape") return setOpen(false);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return openMenu();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
    }
    if ((e.key === "Enter" || e.key === " ") && open) {
      e.preventDefault();
      choose(active);
    }
  };

  return (
    <div ref={rootRef} className={cx("relative", className)}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={cx(
          controlClass,
          "flex items-center justify-between gap-2 text-left",
          compact && "h-10 px-3 text-sm",
          open && "border-gms-primary ring-2 ring-gms-primary/20",
          invalid && "border-gms-danger bg-gms-danger-subtle",
        )}
      >
        <span className={cx("truncate", !selected && "text-gms-text-placeholder")}>{selected?.label ?? placeholder}</span>
        <ChevronDown className={cx("size-4 shrink-0 transition-transform", open && "rotate-180", disabled ? "text-gms-checkbox-readonly" : "text-gms-text")} />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          // อยู่ใน <label> ของ Field: กันไม่ให้ label ส่ง click กลับไปเปิด dropdown ซ้ำ
          onClick={(e) => e.preventDefault()}
          className="absolute right-0 left-0 z-30 mt-2 max-h-64 overflow-y-auto rounded-gms-lg border border-gms-border bg-gms-surface py-2 shadow-gms-overlay"
        >
          {options.length === 0 && <li className="px-5 py-2.5 text-sm text-gms-text-placeholder">No options</li>}
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
              className={cx(
                "flex cursor-pointer items-center justify-between gap-2 px-5 py-2.5 text-[15px] text-gms-text",
                i === active && "bg-gms-surface-sunken",
                o.value === value && "font-medium",
              )}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && <Check className="size-4 shrink-0 text-gms-primary" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * English dd/mm/yyyy date field bound to react-hook-form by name (value stays ISO). `notBefore` names the date it
 * may not precede (Due Date → Doc Date, owner 2026-10-29): earlier days are greyed out in the calendar, and a typed
 * earlier date shows the error at once, not only on Save; it clears when either date is fixed.
 */
export function FormDateInput<T extends FieldValues = FieldValues>({ name, compact, notBefore }: { name: Path<T>; compact?: boolean; notBefore?: Path<T> }) {
  const { control, setError, clearErrors } = useFormContext<T>();
  const { field: { ref, ...field }, fieldState } = useController({ control, name });
  const watched = useWatch({ control, name: notBefore ?? name }) as string | undefined;
  const min = notBefore ? (watched ?? "") : "";
  const value = (field.value as string | undefined) ?? "";
  const errorMessage = fieldState.error?.message;
  useEffect(() => {
    if (!notBefore) return;
    if (isBeforeDate(value, min)) {
      if (errorMessage !== DUE_BEFORE_DOC_MESSAGE) setError(name, { type: "before_doc_date", message: DUE_BEFORE_DOC_MESSAGE });
    } else if (errorMessage === DUE_BEFORE_DOC_MESSAGE) {
      clearErrors(name);
    }
  }, [notBefore, min, value, errorMessage, name, setError, clearErrors]);
  return (
    <DateInput
      ref={ref}
      name={field.name}
      value={value}
      min={min || undefined}
      onChange={field.onChange}
      onBlur={field.onBlur}
      aria-invalid={fieldState.error ? true : undefined}
      className={cx(controlClass, readOnlyInputClass, compact && "h-10 px-3 text-sm")}
    />
  );
}

/** SelectMenu ที่ผูกกับ react-hook-form ผ่าน name */
export function FormSelect<T extends FieldValues = FieldValues>({
  name,
  onValueChange,
  ...props
}: Omit<Parameters<typeof SelectMenu>[0], "value" | "onChange"> & { name: Path<T>; onValueChange?: (value: string) => void }) {
  const { control } = useFormContext<T>();
  const { field, fieldState } = useController({ control, name });
  return (
    <SelectMenu
      {...props}
      invalid={props.invalid ?? Boolean(fieldState.error)}
      value={(field.value as string | undefined) ?? ""}
      onChange={(v) => {
        field.onChange(v);
        onValueChange?.(v);
      }}
    />
  );
}

export function Checkbox({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  return (
    <label className={cx("inline-flex cursor-pointer items-center gap-3 text-[15px] text-[#1C252E]", className)}>
      <input type="checkbox" className="size-5 cursor-pointer rounded border-[#D5DADF] accent-[#0E5E63] disabled:cursor-not-allowed" {...props} />
      {label}
    </label>
  );
}

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
