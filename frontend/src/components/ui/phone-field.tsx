"use client";

import { ChevronsUpDown } from "lucide-react";
import type { Ref } from "react";
import { PHONE_COUNTRIES, phoneCountry, type PhoneValue } from "@/lib/phone";
import { cx } from "./button";
import { FieldShell, fieldBoxClass, fieldFocusWithinClass, readOnlyControlClass, type LabelPosition } from "./outlined-field";

/**
 * Provisional country list from `phone.ts` (Q-UP-09; DEP-UP-01/02 are proposed,
 * not installed). Flags are simplified inline SVGs because flag emoji do not
 * render on Windows.
 */
const countries = PHONE_COUNTRIES;

function Flag({ code }: { code: string }) {
  if (code === "TH") {
    return (
      <svg viewBox="0 0 9 6" className="h-[12px] w-[18px] shrink-0 rounded-[2px]" aria-hidden>
        <rect width="9" height="6" className="fill-red-700" />
        <rect y="1" width="9" height="4" className="fill-white" />
        <rect y="2" width="9" height="2" className="fill-blue-900" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 19 10" className="h-[12px] w-[18px] shrink-0 rounded-[2px]" aria-hidden>
      <rect width="19" height="10" className="fill-white" />
      {[0, 2, 4, 6, 8].map((y) => <rect key={y} y={y} width="19" height="1" className="fill-red-700" />)}
      <rect width="8" height="5" className="fill-blue-900" />
    </svg>
  );
}

type PhoneFieldProps = {
  id: string;
  label: string;
  value: PhoneValue;
  onChange: (value: PhoneValue) => void;
  onBlur: () => void;
  error?: string;
  required?: boolean;
  readOnly?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  labelPosition?: LabelPosition;
};

/** C-11: country selector + national number in one outlined box. */
export function PhoneField({ id, label, value, onChange, onBlur, error, required, readOnly, inputRef, labelPosition }: PhoneFieldProps) {
  const country = phoneCountry(value.country);
  return (
    <FieldShell id={id} label={label} required={required} error={error} readOnly={readOnly} labelPosition={labelPosition}>
      <div
        className={cx(fieldBoxClass({ invalid: Boolean(error), readOnly }), "flex items-center", !readOnly && fieldFocusWithinClass)}
        onBlur={(event) => {
          // Validate once focus leaves the whole phone group, not when moving from the country selector to the number.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onBlur();
        }}
      >
        <div className="relative flex h-full shrink-0 items-center gap-2 pl-4 pr-3">
          <Flag code={country.code} />
          <span className="whitespace-nowrap">{`${country.code} ${country.dial}`}</span>
          <ChevronsUpDown size={16} className="text-gms-text-secondary" aria-hidden />
          <select
            aria-label="Country code"
            autoComplete="tel-country-code"
            value={country.code}
            disabled={readOnly}
            onChange={(event) => onChange({ ...value, country: event.target.value })}
            className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
          >
            {countries.map((entry) => (
              <option key={entry.code} value={entry.code}>{`${entry.name} (${entry.dial})`}</option>
            ))}
          </select>
        </div>
        <input
          ref={inputRef}
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="Phone number"
          maxLength={20}
          value={value.number}
          readOnly={readOnly}
          disabled={readOnly}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange({ ...value, number: event.target.value.replace(/[^\d ]/g, "") })}
          className={cx("h-full min-w-0 flex-1 bg-transparent pr-4 outline-none placeholder:text-gms-text-placeholder", readOnly && readOnlyControlClass)}
        />
      </div>
    </FieldShell>
  );
}
