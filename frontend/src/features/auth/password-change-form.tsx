"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

const schema = z.object({
  currentPassword: z.string().min(1, "Please enter your current password"),
  newPassword: z.string().min(4, "At least 4 characters").max(64, "Up to 64 characters"),
  confirmPassword: z.string(),
}).refine((values) => values.newPassword === values.confirmPassword, { path: ["confirmPassword"], message: "Passwords don't match" });

type Values = z.infer<typeof schema>;

export function PasswordChangeForm() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    reValidateMode: "onChange",
    shouldFocusError: true,
  });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/me/password", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword: newPassword }),
      });
      if (!response.ok) {
        setMessage(response.status === 401 ? "Current password is incorrect" : "Couldn't change the password. Please try again.");
        return;
      }
      reset();
      setMessage("Password changed");
    } catch {
      setMessage("Couldn't change the password. Please try again.");
    } finally {
      setBusy(false);
    }
  });

  return (
    <form onSubmit={onSubmit} className="max-w-[420px] space-y-4" noValidate>
      {([
        ["currentPassword", "Current password", "current-password"],
        ["newPassword", "New password", "new-password"],
        ["confirmPassword", "Confirm new password", "new-password"],
      ] as const).map(([name, label, autoComplete]) => (
        <div key={name}>
          <label htmlFor={name} className="mb-1.5 block text-gms-label font-medium text-[#465661]">{label}</label>
          <input id={name} type="password" autoComplete={autoComplete} {...register(name)} className="h-10 w-full rounded border border-[#d9e1e5] px-3 text-gms-body outline-none focus:border-[#00817b] focus:ring-2 focus:ring-[#00817b]/15" />
          {errors[name] && <p className="mt-1 text-gms-label text-red-600">{errors[name]?.message}</p>}
        </div>
      ))}
      <p className="text-gms-label leading-5 text-[#687887]">Use 4–64 characters; any characters are allowed.</p>
      {message && <p role="status" className="text-gms-label text-[#006c68]">{message}</p>}
      <button disabled={busy} className="h-10 rounded bg-[#006d68] px-5 text-gms-body font-semibold text-white hover:bg-[#005a56] disabled:opacity-60">{busy ? "Saving…" : "Save password"}</button>
    </form>
  );
}
