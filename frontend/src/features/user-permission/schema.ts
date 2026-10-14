import { z } from "zod";
import { DEFAULT_PHONE_COUNTRY, toE164 } from "@/lib/phone";

/**
 * Create-user form (FE-UP-005, SA revision 1 follow-ups).
 * Required set follows screenshot S2 (Username, Password, Name, Phone No.) plus
 * Location (S1 asterisk). Phone is required in the UI (S2) even though the API
 * accepts `phone: null`. Username is the sign-in email (SA rev 1).
 * Password: 4-64 characters, never trimmed (Password Policy, spec 0003).
 * English copy is assumed pending Q-UP-25.
 */
export const PHONE_MAX_DIGITS = 15;
const EMAIL_MAX = 254;
const NAME_MAX = 120;
const LOCATION_MAX = 20;

const emailFormat = z.email();

export const userFormSchema = z.object({
  active: z.boolean(),
  username: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (value.length === 0) ctx.addIssue({ code: "custom", message: "Username is required" });
      else if (value.length > EMAIL_MAX) ctx.addIssue({ code: "custom", message: `Username must be at most ${EMAIL_MAX} characters` });
      else if (!emailFormat.safeParse(value).success) ctx.addIssue({ code: "custom", message: "Enter a valid email address" });
    }),
  password: z.string().superRefine((value, ctx) => {
    if (value.length === 0) ctx.addIssue({ code: "custom", message: "Password is required" });
    else if (value.length < 4) ctx.addIssue({ code: "custom", message: "Password must be at least 4 characters" });
    else if (value.length > 64) ctx.addIssue({ code: "custom", message: "Password must be at most 64 characters" });
  }),
  name: z.string().trim().min(1, "Name is required").max(NAME_MAX, `Name must be at most ${NAME_MAX} characters`),
  phone: z
    .object({ country: z.string().min(1), number: z.string() })
    .superRefine((value, ctx) => {
      const digits = value.number.replace(/\D/g, "");
      if (digits.length === 0) ctx.addIssue({ code: "custom", path: ["number"], message: "Phone No. is required" });
      else if (digits.length > PHONE_MAX_DIGITS) ctx.addIssue({ code: "custom", path: ["number"], message: `Phone No. must be at most ${PHONE_MAX_DIGITS} digits` });
      else if (toE164(value) === null) ctx.addIssue({ code: "custom", path: ["number"], message: "Enter a valid phone number" });
    }),
  locationIds: z.array(z.string()).min(1, "Location is required").max(LOCATION_MAX, `Select at most ${LOCATION_MAX} locations`),
  permissions: z.record(z.string(), z.boolean()),
});

export type UserFormValues = z.infer<typeof userFormSchema>;

/**
 * S1/S5 show Active on and the "primary" location chip preselected (Q-UP-10 open;
 * v1 location options are exactly `primary`). Active stays on until BE-UP-011.
 */
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
