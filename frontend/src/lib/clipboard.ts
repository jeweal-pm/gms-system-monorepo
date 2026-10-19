type ClipboardLike = { writeText: (text: string) => Promise<void> };

/**
 * Copies `text` to the clipboard; resolves false when there is nothing to copy, the Clipboard API is
 * unavailable (e.g. an insecure origin) or the browser refuses.
 */
export async function copyText(text: string, clipboard: ClipboardLike | undefined = globalThis.navigator?.clipboard): Promise<boolean> {
  if (text === "" || !clipboard) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
