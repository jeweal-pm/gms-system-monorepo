"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { authClient } from "@/lib/auth-client";
import { credentialsSchema, type CredentialsValues } from "./schemas";

const demoAccounts = process.env.NODE_ENV === "development"
  ? [
      { label: "Super Admin", username: "superadmin@demo.com", password: "password123", highlighted: true },
      { label: "User", username: "user@demo.com", password: "password123", highlighted: false },
    ]
  : [];

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<CredentialsValues>({
    resolver: zodResolver(credentialsSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    shouldFocusError: true,
    defaultValues: demoAccounts.length > 0 ? { username: demoAccounts[0]!.username, password: demoAccounts[0]!.password } : undefined,
  });

  useEffect(() => {
    const demoAccount = demoAccounts[0];
    if (!demoAccount) return;
    setValue("username", demoAccount.username);
    setValue("password", demoAccount.password);
  }, [setValue]);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setLockoutSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [lockoutSeconds > 0]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError("");
    setSubmitting(true);
    try {
      // ADR-0020: username sign-in; the value is already trimmed by the schema and lowercased by the server.
      const result = await authClient.signIn.username({ username: values.username, password: values.password, rememberMe });
      if (result.error) {
        const error = result.error as unknown as {
          status?: number;
          code?: string;
          attemptsRemaining?: number;
          retryAfterSeconds?: number;
          error?: {
            attemptsRemaining?: number;
            retryAfterSeconds?: number;
          };
        };
        const retryAfterSeconds = error.retryAfterSeconds ?? error.error?.retryAfterSeconds;
        const attemptsRemaining = error.attemptsRemaining ?? error.error?.attemptsRemaining;
        if (error.code === "ACCOUNT_INACTIVE") {
          setServerError("บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ");
        } else if (error.status === 423 || retryAfterSeconds) {
          const seconds = Math.max(1, retryAfterSeconds ?? 60);
          setLockoutSeconds(seconds);
          setServerError(`ใส่รหัสผ่านผิด 3 ครั้ง กรุณารอ ${seconds} วินาที`);
        } else if (error.status === 429) {
          setServerError("มีการลองเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่");
        } else if (attemptsRemaining !== undefined) {
          setServerError(`ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (เหลืออีก ${attemptsRemaining} ครั้ง)`);
        } else {
          setServerError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
        }
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setServerError("ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <form onSubmit={onSubmit} className="w-full min-w-0 space-y-6" noValidate>
      {demoAccounts.map((account) => (
        <button
          key={account.username}
          type="button"
          onClick={() => {
            setValue("username", account.username, { shouldValidate: true });
            setValue("password", account.password, { shouldValidate: true });
          }}
          className={`flex min-h-[84px] w-full min-w-0 items-start gap-4 rounded-xl px-5 py-4 text-left text-gms-body text-[#31515d] transition hover:ring-2 hover:ring-[#54bfd7]/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#45b7d0] ${account.highlighted ? "bg-[#d9f2fa]" : "bg-[#f5f5f7]"}`}
        >
          <span aria-hidden="true" className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-[#55bed6] text-gms-label font-bold text-[#55bed6]">i</span>
          <span className="min-w-0 break-words"><span>Use Username : <strong>{account.username}</strong></span><br /><span>Password : <strong>{account.password}</strong></span></span>
        </button>
      ))}

      <div className="relative mt-[27px] space-y-1">
        <label className="absolute left-5 top-2 text-gms-label leading-4 text-[#89949a]" htmlFor="username">Username</label>
        <input id="username" autoComplete="username" type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={errors.username ? true : undefined} {...register("username")} defaultValue={demoAccounts[0]?.username ?? ""} className="h-[64px] w-full rounded-xl border border-transparent bg-[#eeeeef] px-5 pt-[17px] text-gms-body text-[#283942] outline-none transition focus:border-[#00817b] focus:ring-2 focus:ring-[#00817b]/15" />
        {errors.username && <p className="px-1 text-gms-label text-red-600">{errors.username.message}</p>}
      </div>

      <div className="space-y-1">
        <div className="relative">
          <label className="absolute left-5 top-2 text-gms-label leading-4 text-[#89949a]" htmlFor="password">Password</label>
          <input id="password" autoComplete="current-password" type={showPassword ? "text" : "password"} {...register("password")} defaultValue={demoAccounts[0]?.password ?? ""} className="h-[64px] w-full rounded-xl border border-transparent bg-[#eeeeef] px-5 pr-14 pt-[17px] text-gms-body text-[#283942] outline-none transition focus:border-[#00817b] focus:ring-2 focus:ring-[#00817b]/15" />
          <button aria-label={showPassword ? "Hide password" : "Show password"} type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex w-14 items-center justify-center text-[#8da0a6] hover:text-[#283942]">
            {showPassword ? <Eye size={22} /> : <EyeOff size={22} />}
          </button>
        </div>
        {errors.password && <p className="px-1 text-gms-label text-red-600">{errors.password.message}</p>}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-y-3 pt-1 text-gms-body">
        <label className="flex items-center gap-2.5 text-[#657681]"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="size-5 rounded border border-[#cbdce2] accent-[#007570]" /> Remember this device</label>      </div>
      {serverError && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-gms-body text-red-700">{lockoutSeconds > 0 ? `บัญชีถูกล็อกชั่วคราว กรุณารออีก ${lockoutSeconds} วินาที` : serverError}</p>}
      <button disabled={submitting || lockoutSeconds > 0} type="submit" className="mt-[19px] h-[64px] w-full rounded-xl bg-[#006d70] text-gms-body font-semibold text-white shadow-sm transition hover:bg-[#005a5d] disabled:cursor-wait disabled:opacity-65">
        {submitting ? "Logging in…" : lockoutSeconds > 0 ? `Try again in ${lockoutSeconds}s` : "Log in"}
      </button>
    </form>
  );
}
