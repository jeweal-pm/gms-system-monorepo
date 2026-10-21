/**
 * กรองค่าที่พิมพ์ในช่องตัวเลข: เหลือเฉพาะตัวเลขและจุดทศนิยมจุดเดียว, จำกัดจำนวนทศนิยม
 * ใช้กับช่องราคา / จำนวน / น้ำหนัก / % (ห้ามกรอกตัวอักษร)
 */
export function sanitizeDecimal(raw: string, decimals: number): string {
  const cleaned = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  if (decimals === 0) return cleaned.replace(/\./g, "");
  const [whole, ...rest] = cleaned.split(".");
  if (rest.length === 0) return whole;
  return `${whole}.${rest.join("").slice(0, decimals)}`;
}
