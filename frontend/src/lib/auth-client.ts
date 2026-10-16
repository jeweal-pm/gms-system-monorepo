"use client";

import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** ADR-0020: sign-in is by username only (`/sign-in/username`); the plugin ships with the installed better-auth. */
export const authClient = createAuthClient({
  baseURL: typeof window === "undefined" ? "http://localhost:3000" : window.location.origin,
  plugins: [usernameClient()],
});
