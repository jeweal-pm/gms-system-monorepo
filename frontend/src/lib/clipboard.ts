type ClipboardLike = { writeText: (text: string) => Promise<void> };
type LegacyCopy = (text: string) => boolean;

/**
 * Copies `text` to the clipboard; resolves false when there is nothing to copy or every method fails.
 * The Clipboard API is missing on insecure origins (e.g. the dev stack opened by LAN IP over http), so
 * the legacy `execCommand("copy")` path is the fallback.
 */
export async function copyText(
  text: string,
  clipboard: ClipboardLike | undefined = globalThis.navigator?.clipboard,
  legacyCopy: LegacyCopy = execCommandCopy,
): Promise<boolean> {
  if (text === "") return false;
  if (clipboard) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }
  return legacyCopy(text);
}

function execCommandCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
    active?.focus();
  }
}
