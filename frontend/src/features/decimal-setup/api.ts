/**
 * Decimal Setup data access — MOCK (decimal-setup UI rev 1, owner 2026-10-27: frontend only, no API or
 * database yet). Kept in memory and in this browser's localStorage so a refresh keeps it during demos.
 * When the API exists, only this file changes (the page uses getDecimalSetup / saveDecimalSetup).
 */
import { DECIMAL_CHOICES, DECIMAL_PAGES, defaultDecimalSetup, type DecimalSetup } from "./pages";

const STORAGE_KEY = "gms.decimal-setup.v1";
const DELAY_MS = 250;
let memory: DecimalSetup | null = null;

const delay = () => new Promise((resolve) => setTimeout(resolve, DELAY_MS));
const isPlaces = (value: unknown): value is number => typeof value === "number" && (DECIMAL_CHOICES as readonly number[]).includes(value);

/** Accepts only a well-formed stored value; anything else falls back to the defaults. */
export function parseStored(raw: string | null): DecimalSetup | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<DecimalSetup>;
    const base = defaultDecimalSetup();
    if (!value.defaults || !isPlaces(value.defaults.weight) || !isPlaces(value.defaults.price) || typeof value.pages !== "object" || value.pages === null) return null;
    for (const page of DECIMAL_PAGES) {
      const places = (value.pages as Record<string, unknown>)[page.key] as { weight?: unknown; price?: unknown } | undefined;
      if (!places || !isPlaces(places.price)) continue;
      base.pages[page.key] = { weight: page.hasWeight && isPlaces(places.weight) ? places.weight : base.pages[page.key].weight, price: places.price };
    }
    base.defaults = { weight: value.defaults.weight, price: value.defaults.price };
    return base;
  } catch {
    return null;
  }
}

function readStorage(): DecimalSetup | null {
  try {
    return parseStored(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export async function getDecimalSetup(): Promise<DecimalSetup> {
  await delay();
  memory ??= readStorage() ?? defaultDecimalSetup();
  return structuredClone(memory);
}

export async function saveDecimalSetup(setup: DecimalSetup): Promise<DecimalSetup> {
  await delay();
  memory = structuredClone(setup);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Storage blocked (private mode): the value still lives in memory for this session.
  }
  return structuredClone(memory);
}
