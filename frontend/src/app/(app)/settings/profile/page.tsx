"use client";

import { TabPage } from "@/features/home/tabs/tab-host";
import type { Breadcrumb } from "@/features/home/navigation";
import { PasswordChangeForm } from "@/features/auth/password-change-form";

const breadcrumbs: Breadcrumb[] = [{ label: "Home", href: "/" }, { label: "Settings" }];

export default function ProfileSettingsPage() {
  return (
    <TabPage breadcrumbs={breadcrumbs}>
      <div className="mx-auto max-w-[760px] px-6 py-10 sm:px-10">
        <h1 className="text-gms-title font-semibold">Super Admin Profile</h1>
        <p className="mb-7 mt-1 text-gms-body text-[#687887]">Change your account password</p>
        <PasswordChangeForm />
      </div>
    </TabPage>
  );
}
