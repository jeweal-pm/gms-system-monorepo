"use client";

import { AppShell } from "@/features/home/app-shell";

/**
 * app-shell-tabs (ADR-0037): every signed-in page shares one App Shell, so its tabs keep their pages
 * alive across navigations. The login page stays outside this group.
 */
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
