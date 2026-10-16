"use client";

import { useCallback, useEffect, useState } from "react";
import { useFormState, useWatch, type FieldValues, type UseFormReturn } from "react-hook-form";
import { retryTransient } from "@/lib/trpc-error";
import { trpc } from "@/providers/app-providers";
import { replacedTakenCodeMessage, shouldPrefillCode } from "./code-suggestion";

/** Existing approved contract; shares the tRPC cache entry with the shell and other pages. */
export function usePermissionMine() {
  return trpc.permission.mine.useQuery(undefined, { retry: retryTransient, staleTime: 30_000 });
}

/** Trimmed, debounced search text (300 ms); unchanged trimmed text does not change the key. */
export function useDebouncedSearch(raw: string, delayMs = 300): string {
  const trimmed = raw.trim();
  const [debounced, setDebounced] = useState(trimmed);
  const apply = useCallback(() => setDebounced(trimmed), [trimmed]);
  useEffect(() => {
    const timer = window.setTimeout(apply, delayMs);
    return () => window.clearTimeout(timer);
  }, [apply, delayMs]);
  return debounced;
}

/**
 * ADR-0021 §2: prefills the suggested Code Name into a new record while the user has not edited the
 * field. The suggestion becomes the field's default, so an untouched draft stays "not dirty" (no
 * discard prompt). When a newer suggestion replaces a value the server reported as taken, the field
 * keeps an error that names both codes.
 */
export function useSuggestedCodePrefill<TForm extends FieldValues & { code: string }>(form: UseFormReturn<TForm>, enabled: boolean, suggestion: string | undefined) {
  const codeForm = form as unknown as UseFormReturn<{ code: string }>;
  const current = useWatch({ control: codeForm.control, name: "code" });
  const { dirtyFields } = useFormState({ control: codeForm.control, name: "code" });
  const codeDirty = Boolean(dirtyFields.code);
  useEffect(() => {
    if (!shouldPrefillCode({ enabled, suggestion, current, codeDirty }) || suggestion === undefined) return;
    const takenError = codeForm.getFieldState("code").error?.type === "server" && current.trim() !== "";
    codeForm.resetField("code", { defaultValue: suggestion, keepError: takenError });
    if (takenError) codeForm.setError("code", { type: "server", message: replacedTakenCodeMessage(current.trim(), suggestion) });
  }, [codeForm, enabled, suggestion, current, codeDirty]);
}

/** Native prompt on close/reload while the form has unsaved changes. */
export function useUnsavedChangesPrompt(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
