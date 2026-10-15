import { z } from "zod";

/** ADR-0020: the sign-in name is a username (e.g. `user1`), not validated as an email. */
export const credentialsSchema = z.object({
  username: z.string().trim().min(1, "กรุณากรอกชื่อผู้ใช้"),
  password: z.string().min(1, "กรุณากรอกรหัสผ่าน"),
});

export type CredentialsValues = z.infer<typeof credentialsSchema>;
