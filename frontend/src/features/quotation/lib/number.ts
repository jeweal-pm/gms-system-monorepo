/** No leading zeros on the whole part (owner 2026-11-02): "022" → "22", "00" → "0"; "0.5" stays. */
export const stripLeadingZeros = (whole: string): string => whole.replace(/^0+(?=\d)/, "");

/**
 * กรองค่าที่พิมพ์ในช่องตัวเลข: เหลือเฉพาะตัวเลขและจุดทศนิยมจุดเดียว, จำกัดจำนวนทศนิยม, ไม่มี 0 นำหน้า
 * ใช้กับช่องราคา / จำนวน / น้ำหนัก / % (ห้ามกรอกตัวอักษร)
 */
export function sanitizeDecimal(raw: string, decimals: number): string {
  const cleaned = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  if (decimals === 0) return stripLeadingZeros(cleaned.replace(/\./g, ""));
  const [first, ...rest] = cleaned.split(".");
  const whole = stripLeadingZeros(first);
  if (rest.length === 0) return whole;
  return `${whole}.${rest.join("").slice(0, decimals)}`;
}

/**
 * A quantity cell (memo return Pcs / Weight, owner 2026-10-29): digits only, at most `whole` integer digits and
 * `decimals` decimals — the server limits (pcs ≤ 999,999; weight 5 + 3 digits). ".5" becomes "0.5".
 */
export function sanitizeQuantity(raw: string, whole: number, decimals: number): string {
  const [int, frac] = sanitizeDecimal(raw, decimals).split(".");
  const head = int.slice(0, whole) || (frac === undefined ? "" : "0");
  return frac === undefined ? head : `${head}.${frac}`;
}
