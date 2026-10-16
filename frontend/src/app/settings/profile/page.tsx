"use client";

import { AppShell, type Breadcrumb } from "@/features/home/app-shell";
import { PasswordChangeForm } from "@/features/auth/password-change-form";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Settings" }];

export default function ProfileSettingsPage() {
  return <AppShell breadcrumbs={breadcrumbs}><div className="mx-auto max-w-[760px] px-6 py-10 sm:px-10"><h1 className="text-gms-title font-semibold">Super Admin Profile</h1><p className="mb-7 mt-1 text-gms-body text-[#687887]">เปลี่ยนรหัสผ่านของบัญชี</p><PasswordChangeForm /></div></AppShell>;
}
