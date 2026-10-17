"use client";

import { ChevronsUpDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type Ref } from "react";
import { flagLoaders } from "@/lib/flag-loaders";
import { PHONE_COUNTRIES, phoneCountry, type PhoneCountry, type PhoneValue } from "@/lib/phone";
import { cx, focusRing } from "./button";
import { FieldShell, fieldBoxClass, fieldFocusWithinClass, readOnlyControlClass, type LabelPosition } from "./outlined-field";

/** Shown first, as in the design (owner 2026-10-17); the rest follow by name (`lib/phone.ts`, option A). */
const PINNED_COUNTRIES = ["US", "GB", "CA", "AU"];
export const ORDERED_COUNTRIES: readonly PhoneCountry[] = [
  ...PINNED_COUNTRIES.map((code) => PHONE_COUNTRIES.find((entry) => entry.code === code)).filter((entry): entry is PhoneCountry => entry !== undefined),
  ...PHONE_COUNTRIES.filter((entry) => !PINNED_COUNTRIES.includes(entry.code)),
];

/** Name contains the text, the ISO code equals it, or the calling code starts with its digits ("66", "+66"). */
export function matchCountries(query: string): readonly PhoneCountry[] {
  const text = query.trim().toLowerCase();
  if (text === "") return ORDERED_COUNTRIES;
  const digits = text.replace(/^\+/, "");
  return ORDERED_COUNTRIES.filter(
    (entry) => entry.name.toLowerCase().includes(text) || entry.code.toLowerCase() === text || (/^\d+$/.test(digits) && entry.dial.slice(1).startsWith(digits)),
  );
}

/** Flag SVG markup per country, loaded once per browser session. */
const flagCache = new Map<string, string>();

/**
 * Loads one country's flag (country-flag-icons, MIT, local SVG; ≈0.3–5 kB each) instead of bundling
 * all 245. Flag emoji are not used because Windows does not render them.
 */
function loadFlag(code: string): Promise<string> {
  const cached = flagCache.get(code);
  if (cached !== undefined) return Promise.resolve(cached);
  const load = flagLoaders[code];
  if (!load) return Promise.resolve("");
  return load()
    .then((module) => {
      flagCache.set(code, module.default);
      return module.default;
    })
    .catch(() => "");
}

const flagSize = { sm: "h-[12px] w-[18px] rounded-[2px]", md: "h-4 w-6 rounded-[3px]" } as const;

/** `lazy`: load only when the row scrolls into view (the country list has 245 rows). */
function Flag({ code, size = "sm", lazy = false }: { code: string; size?: keyof typeof flagSize; lazy?: boolean }) {
  const holderRef = useRef<HTMLSpanElement>(null);
  const [loaded, setLoaded] = useState<{ code: string; svg: string } | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => void loadFlag(code).then((svg) => active && setLoaded({ code, svg }));
    const holder = holderRef.current;
    if (!lazy || !holder || typeof IntersectionObserver === "undefined") {
      load();
      return () => {
        active = false;
      };
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        load();
      }
    });
    observer.observe(holder);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [code, lazy]);

  const svg = loaded?.code === code ? loaded.svg : flagCache.get(code);
  return (
    <span ref={holderRef} aria-hidden className={cx("inline-flex shrink-0 overflow-hidden", flagSize[size], !svg && "bg-gms-surface-sunken")}>
      {svg && (
        // eslint-disable-next-line @next/next/no-img-element -- inline data URI from the package; next/image adds nothing here
        <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt="" className="size-full object-cover" />
      )}
    </span>
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

/**
 * C-11: country picker + national number in one outlined box. The picker (owner design 2026-10-17)
 * opens a panel with a search box and every country (flag, name, calling code; US, UK, Canada and
 * Australia first). Keyboard: Enter/Space/ArrowDown open; type to search; ArrowUp/Down move; Enter
 * chooses; Escape/Tab close.
 */
export function PhoneField({ id, label, value, onChange, onBlur, error, required, readOnly, inputRef, labelPosition }: PhoneFieldProps) {
  const country = phoneCountry(value.country);
  const listId = `${id}-countries`;
  const optionId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const matches = useMemo(() => matchCountries(query), [query]);

  // Close when the pointer goes down outside the field.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // Keep the active row visible while moving with the keyboard.
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function openPicker() {
    setQuery("");
    setActive(Math.max(0, ORDERED_COUNTRIES.findIndex((entry) => entry.code === country.code)));
    setOpen(true);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function choose(entry: PhoneCountry | undefined) {
    if (entry) onChange({ ...value, country: entry.code });
    close(true);
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const last = matches.length - 1;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => Math.min(Math.max(current + (event.key === "ArrowDown" ? 1 : -1), 0), Math.max(last, 0)));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(matches[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <FieldShell id={id} label={label} required={required} error={error} readOnly={readOnly} labelPosition={labelPosition}>
      <div
        ref={boxRef}
        className={cx(fieldBoxClass({ invalid: Boolean(error), readOnly }), "relative flex items-center", !readOnly && fieldFocusWithinClass)}
        onBlur={(event) => {
          // Validate once focus leaves the whole phone group (picker included), not when moving inside it.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onBlur();
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-label={`Country code: ${country.name} ${country.dial}`}
          disabled={readOnly}
          onClick={() => (open ? close(false) : openPicker())}
          onKeyDown={(event) => {
            if (!open && event.key === "ArrowDown") {
              event.preventDefault();
              openPicker();
            }
          }}
          className={cx("flex h-full shrink-0 items-center gap-2 rounded-l-gms-md pl-4 pr-3 outline-none disabled:cursor-default", !readOnly && "cursor-pointer", readOnly && readOnlyControlClass, focusRing)}
        >
          <Flag code={country.code} />
          <span className="whitespace-nowrap">{`${country.code} ${country.dial}`}</span>
          <ChevronsUpDown size={16} className="text-gms-text-secondary" aria-hidden />
        </button>
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

        {open && (
          <div className="absolute top-full left-0 z-30 mt-2 w-full min-w-[300px] rounded-gms-lg border border-gms-border bg-gms-surface p-2 shadow-gms-overlay">
            <label className="flex h-11 items-center gap-2 rounded-gms-md bg-gms-surface-sunken px-3">
              <Search size={18} aria-hidden className="shrink-0 text-gms-text" />
              <span className="sr-only">Search countries</span>
              <input
                ref={searchRef}
                type="search"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={matches[active] ? `${optionId}-${matches[active].code}` : undefined}
                value={query}
                autoComplete="off"
                placeholder="Search ..."
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={onSearchKeyDown}
                className="h-full min-w-0 flex-1 bg-transparent text-gms-body text-gms-text outline-none placeholder:text-gms-text-placeholder"
              />
            </label>
            <ul ref={listRef} id={listId} role="listbox" aria-label="Countries" className="mt-2 max-h-[340px] overflow-y-auto">
              {matches.length === 0 && <li className="px-3 py-2.5 text-gms-body text-gms-text-secondary">No countries match</li>}
              {matches.map((entry, index) => {
                const selected = entry.code === country.code;
                return (
                  <li
                    key={entry.code}
                    id={`${optionId}-${entry.code}`}
                    data-index={index}
                    role="option"
                    aria-selected={selected}
                    onPointerEnter={() => setActive(index)}
                    // Keep focus in the search box so the group does not blur while choosing.
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => choose(entry)}
                    className={cx(
                      "flex cursor-pointer items-center gap-3 rounded-gms-md px-3 py-2.5 text-gms-body text-gms-text",
                      index === active && "bg-gms-nav-active",
                      selected && "font-semibold",
                    )}
                  >
                    <Flag code={entry.code} size="md" lazy />
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    <span className="shrink-0 font-normal text-gms-text-secondary">{entry.dial}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </FieldShell>
  );
}
