/**
 * Fixed-point decimal (scale 1e8) บน bigint — เลี่ยง float กับเงิน/น้ำหนัก
 * ไม่ใช้ bigint literal (`1n`) เพราะ tsconfig target = ES2017
 * ถ้าภายหลังเพิ่ม decimal.js ในโปรเจกต์ เปลี่ยน implementation ที่ไฟล์นี้ที่เดียว
 */
export type Dec = bigint;

const SCALE_DIGITS = 8;
const N0 = BigInt(0);
const N1 = BigInt(1);
const N2 = BigInt(2);
const N10 = BigInt(10);
const pow10 = (digits: number): bigint => {
  let result = N1;
  for (let i = 0; i < digits; i++) result *= N10;
  return result;
};
const SCALE = pow10(SCALE_DIGITS);

export const ZERO: Dec = N0;

export function dec(input: string | number | null | undefined): Dec {
  const text = String(input ?? "").replace(/,/g, "").trim();
  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (!match[2] && !match[3])) return ZERO;
  const [, sign, whole = "", fraction = ""] = match;
  const frac = fraction.slice(0, SCALE_DIGITS).padEnd(SCALE_DIGITS, "0");
  const value = BigInt(whole || "0") * SCALE + BigInt(frac || "0");
  return sign ? -value : value;
}

function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === N0) return ZERO;
  const negative = numerator < N0 !== denominator < N0;
  const n = numerator < N0 ? -numerator : numerator;
  const d = denominator < N0 ? -denominator : denominator;
  const q = (n * N2 + d) / (d * N2); // round half up
  return negative ? -q : q;
}

export const add = (...values: Dec[]): Dec => values.reduce((sum, v) => sum + v, ZERO);
export const sub = (a: Dec, b: Dec): Dec => a - b;
export const mul = (a: Dec, b: Dec): Dec => divRound(a * b, SCALE);
export const div = (a: Dec, b: Dec): Dec => divRound(a * SCALE, b);
export const min = (a: Dec, b: Dec): Dec => (a < b ? a : b);
export const max = (a: Dec, b: Dec): Dec => (a > b ? a : b);

export function round(value: Dec, digits = 2): Dec {
  const unit = pow10(SCALE_DIGITS - digits);
  return divRound(value, unit) * unit;
}

export function toFixed(value: Dec, digits = 2): string {
  const rounded = round(value, digits);
  const negative = rounded < N0;
  const abs = negative ? -rounded : rounded;
  const whole = abs / SCALE;
  const fraction = (abs % SCALE).toString().padStart(SCALE_DIGITS, "0").slice(0, digits);
  return `${negative ? "-" : ""}${whole}${digits > 0 ? `.${fraction}` : ""}`;
}
