import { z } from "zod";
import { DEFAULT_PHONE_COUNTRY, toE164, type PhoneValue } from "@/lib/phone";

/**
 * User form, UI revision 2 (ADR-0020, sources rev2-02/03).
 * Required: Username (create only; read-only after creation), Name, Location.
 * Password: required on create, optional on edit (empty = unchanged), 4-64,
 * never trimmed. Phone No. is optional (no asterisk in rev2-02).
 * Username: 3-64 of `a-z 0-9 . _ - @ +` after trim + lowercase; shown as typed.
 */
export const PHONE_MAX_DIGITS = 15;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 64;
const NAME_MAX = 120;
const LOCATION_MAX = 20;
const USERNAME_PATTERN = /^[a-z0-9._@+-]+$/;

export type UserFormMode = "create" | "edit";

function usernameIssue(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (value.length === 0) return "Username is required";
  if (value.length < USERNAME_MIN) return `Username must be at least ${USERNAME_MIN} characters`;
  if (value.length > USERNAME_MAX) return `Username must be at most ${USERNAME_MAX} characters`;
  if (!USERNAME_PATTERN.test(value)) return "Use only a-z, 0-9, and . _ - @ + (no spaces)";
  return null;
}

function passwordIssue(value: string, mode: UserFormMode): string | null {
  if (value.length === 0) return mode === "create" ? "Password is required" : null;
  if (value.length < 4) return "Password must be at least 4 characters";
  if (value.length > 64) return "Password must be at most 64 characters";
  return null;
}

const phoneSchema = z
  .object({ country: z.string().min(1), number: z.string() })
  .superRefine((value, ctx) => {
    const digits = value.number.replace(/\D/g, "");
    if (digits.length === 0) return; // optional
    if (digits.length > PHONE_MAX_DIGITS) ctx.addIssue({ code: "custom", path: ["number"], message: `Phone No. must be at most ${PHONE_MAX_DIGITS} digits` });
    else if (toE164(value) === null) ctx.addIssue({ code: "custom", path: ["number"], message: "Enter a valid phone number" });
  });

/**
 * `mode: "edit"` skips the Username rule (the field is read-only) and allows an
 * empty password. `lockedSuperAdmin` also skips the password (the field is disabled).
 */
export function userFormSchema(mode: UserFormMode, lockedSuperAdmin = false) {
  return z.object({
    active: z.boolean(),
    username: z.string().superRefine((value, ctx) => {
      if (mode === "edit") return;
      const issue = usernameIssue(value);
      if (issue) ctx.addIssue({ code: "custom", message: issue });
    }),
    password: z.string().superRefine((value, ctx) => {
      if (lockedSuperAdmin) return;
      const issue = passwordIssue(value, mode);
      if (issue) ctx.addIssue({ code: "custom", message: issue });
    }),
    name: z.string().trim().min(1, "Name is required").max(NAME_MAX, `Name must be at most ${NAME_MAX} characters`),
    phone: phoneSchema,
    locationIds: z.array(z.string()).min(1, "Location is required").max(LOCATION_MAX, `Select at most ${LOCATION_MAX} locations`),
    permissions: z.record(z.string(), z.boolean()),
  });
}

export type UserFormValues = {
  active: boolean;
  username: string;
  password: string;
  name: string;
  phone: PhoneValue;
  locationIds: string[];
  permissions: Record<string, boolean>;
};

/** New draft: Active on and the "primary" location preselected (rev2-02). */
export function emptyUserForm(permissions: Record<string, boolean> = {}): UserFormValues {
  return {
    active: true,
    username: "",
    password: "",
    name: "",
    phone: { country: DEFAULT_PHONE_COUNTRY, number: "" },
    locationIds: ["primary"],
    permissions,
  };
}
