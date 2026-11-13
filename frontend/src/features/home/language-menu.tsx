"use client";

import { Check } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

/** Owner design 2026-11-12: the language button shows the current language's round flag at 18 × 18. */
export const LANGUAGE_FLAG_SIZE = 18;

/** The owner's US flag SVG (18-unit artboard); the clip id is per instance so several flags never share one. */
export function UsFlagIcon({ size = LANGUAGE_FLAG_SIZE }: Readonly<{ size?: number }>) {
  const clipId = `flag-us-${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden data-flag="us" className="shrink-0">
      <g clipPath={`url(#${clipId})`}>
        <path d="M9 18C13.9706 18 18 13.9706 18 9C18 4.02944 13.9706 0 9 0C4.02944 0 0 4.02944 0 9C0 13.9706 4.02944 18 9 18Z" fill="#F0F0F0" />
        <path d="M8.60876 9H18.0001C18.0001 8.18768 17.8918 7.40074 17.69 6.65216H8.60876V9Z" fill="#D80027" />
        <path d="M8.60876 4.30438H16.6791C16.1282 3.40537 15.4237 2.61073 14.6024 1.95654H8.60876V4.30438Z" fill="#D80027" />
        <path d="M9.00006 18C11.1182 18 13.065 17.2679 14.6024 16.0435H3.39771C4.93509 17.2679 6.88194 18 9.00006 18Z" fill="#D80027" />
        <path d="M1.32098 13.6957H16.6791C17.1214 12.974 17.4644 12.1851 17.69 11.3478H0.310059C0.535656 12.1851 0.878676 12.974 1.32098 13.6957V13.6957Z" fill="#D80027" />
        <path
          d="M4.16897 1.40548H4.98913L4.22624 1.95971L4.51765 2.85652L3.75479 2.30228L2.99194 2.85652L3.24366 2.08178C2.57196 2.64129 1.98323 3.29681 1.49808 4.02722H1.76087L1.27526 4.38001C1.1996 4.50622 1.12704 4.63444 1.0575 4.76455L1.28939 5.47826L0.856758 5.16393C0.749215 5.39177 0.650848 5.62475 0.56243 5.86259L0.81791 6.64896H1.76087L0.99798 7.2032L1.28939 8.1L0.526535 7.54576L0.0695742 7.87778C0.0238359 8.24544 0 8.61993 0 9H9C9 4.02947 9 3.44348 9 0C7.22208 0 5.56471 0.515742 4.16897 1.40548V1.40548ZM4.51765 8.1L3.75479 7.54576L2.99194 8.1L3.28335 7.2032L2.52046 6.64896H3.46342L3.75479 5.75216L4.04617 6.64896H4.98913L4.22624 7.2032L4.51765 8.1ZM4.22624 4.58146L4.51765 5.47826L3.75479 4.92402L2.99194 5.47826L3.28335 4.58146L2.52046 4.02722H3.46342L3.75479 3.13042L4.04617 4.02722H4.98913L4.22624 4.58146ZM7.74591 8.1L6.98305 7.54576L6.22019 8.1L6.51161 7.2032L5.74871 6.64896H6.69168L6.98305 5.75216L7.27443 6.64896H8.21739L7.4545 7.2032L7.74591 8.1ZM7.4545 4.58146L7.74591 5.47826L6.98305 4.92402L6.22019 5.47826L6.51161 4.58146L5.74871 4.02722H6.69168L6.98305 3.13042L7.27443 4.02722H8.21739L7.4545 4.58146ZM7.4545 1.95971L7.74591 2.85652L6.98305 2.30228L6.22019 2.85652L6.51161 1.95971L5.74871 1.40548H6.69168L6.98305 0.508676L7.27443 1.40548H8.21739L7.4545 1.95971Z"
          fill="#0052B4"
        />
      </g>
      <defs>
        <clipPath id={clipId}>
          <rect width="18" height="18" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

/**
 * The languages the UI offers. The app is English-only today (no translation layer yet), so the
 * menu lists English alone; another language is added here once its translations exist.
 */
export const LANGUAGES = [{ code: "en", label: "English", Flag: UsFlagIcon }] as const;
export type LanguageCode = (typeof LANGUAGES)[number]["code"];

const itemClass =
  "flex h-9 w-full items-center gap-2 px-3 text-left text-gms-body text-gms-text outline-none transition-colors hover:bg-gms-nav-active focus:bg-gms-nav-active focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gms-primary";

/**
 * Topbar language button (owner 2026-11-12): the current language's flag; it opens a radio menu of
 * the offered languages. Escape closes and returns focus; an outside click or Tab closes.
 */
export function LanguageMenu({ topbarIconButton }: Readonly<{ topbarIconButton: string }>) {
  const [isOpen, setIsOpen] = useState(false);
  const [current] = useState<LanguageCode>("en");
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const active = LANGUAGES.find((language) => language.code === current) ?? LANGUAGES[0];
  const label = `Language: ${active.label}`;

  useEffect(() => {
    if (!isOpen) return;
    menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  function close(returnFocus: boolean) {
    setIsOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function handleMenuKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen((open) => !open)}
        className={topbarIconButton}
      >
        <active.Flag />
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Language"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-full z-50 mt-1 min-w-40 overflow-hidden rounded-gms-md border border-gms-border bg-gms-surface py-1 shadow-gms-overlay"
        >
          {LANGUAGES.map((language) => (
            <button
              key={language.code}
              type="button"
              role="menuitemradio"
              aria-checked={language.code === current}
              onClick={() => close(true)}
              className={itemClass}
            >
              <language.Flag />
              <span className="flex-1">{language.label}</span>
              {language.code === current && <Check aria-hidden size={16} className="text-gms-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
