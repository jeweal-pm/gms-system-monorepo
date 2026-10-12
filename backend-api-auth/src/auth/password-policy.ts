import { z } from "zod";

export const passwordSchema = z.string()
  .min(4, "รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร")
  .max(64, "รหัสผ่านต้องมีไม่เกิน 64 ตัวอักษร")
