"use client";

import { ImagePlus } from "lucide-react";
import { Controller, useWatch, type UseFormReturn } from "react-hook-form";
import type { LocationOption } from "../api";
import { USERNAME_MAX, type UserFormValues } from "../schema";
import { cx, focusRing } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MultiSelect } from "./ui/multi-select";
import { TextField } from "@/components/ui/outlined-field";
import { PhoneField } from "@/components/ui/phone-field";
import { Switch } from "@/components/ui/switch";

type LocationsState = { options: readonly LocationOption[]; status: "loading" | "error" | "ready" };

/** `create`: new draft; `view`: saved user, read-only; `edit`: saved user after Edit. */
export type PersonalMode = "create" | "view" | "edit";

type PersonalInformationCardProps = {
  mode: PersonalMode;
  form: UseFormReturn<UserFormValues>;
  locations: LocationsState;
  /** Super Admin target: Username, Password and Active stay locked; Name/Phone/Location are editable. */
  superAdmin: boolean;
  /** The signed-in user's own account (cannot be deactivated). */
  isSelf: boolean;
  onPhotoClick: () => void;
};

const noop = () => {};

/** Photo tile layout only (C-08); upload wiring is FE-UP-013 (requires-sa, BE-UP-009 deferred). */
function PhotoTile({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Upload photo, JPEG or PNG only"
      className={cx(
        "flex h-[120px] w-[120px] shrink-0 flex-col items-center justify-center gap-1 rounded-gms-md bg-gms-upload-tile text-center shadow-gms-tile transition-colors enabled:hover:brightness-[0.98] disabled:cursor-default",
        focusRing,
      )}
    >
      <ImagePlus size={28} strokeWidth={1.5} className="mb-1 text-gms-text" aria-hidden />
      <span className="text-gms-label font-semibold text-gms-text">Upload photo</span>
      <span className="text-gms-label text-gms-text-secondary">JPEG or PNG only</span>
    </button>
  );
}

const grid = "grid min-w-0 flex-1 grid-cols-1 items-start gap-x-4 gap-y-5 md:grid-cols-2 xl:grid-cols-3";

/**
 * C-06..C-12 Personal Information card, UI revision 2 (rev2-02/03).
 * Username is editable only on create (sign-in name, immutable afterwards).
 * Password is optional on edit (blank = unchanged) and locked for a Super
 * Admin (changed only on the Profile page, ADR-0011). Active cannot be turned
 * off for a Super Admin or the signed-in user.
 */
export function PersonalInformationCard({ mode, form, locations, superAdmin, isSelf, onPhotoClick }: PersonalInformationCardProps) {
  const {
    control,
    register,
    formState: { errors },
  } = form;
  const [username, name] = useWatch({ control, name: ["username", "name"] });
  const readOnly = mode === "view";
  const activeLocked = superAdmin || isSelf;

  const activeSwitch = (
    <Controller
      control={control}
      name="active"
      render={({ field }) => (
        <Switch
          id="user-active"
          label="Active"
          checked={field.value}
          onChange={field.onChange}
          readOnly={readOnly}
          disabled={!readOnly && activeLocked}
          hint={!readOnly && activeLocked ? (superAdmin ? "Super Admin is always active" : "You can't deactivate your own account") : undefined}
        />
      )}
    />
  );

  return (
    <Card title="Personal Information" titleId="personal-information-title" titleClassName="text-gms-heading font-medium text-gms-text" trailing={activeSwitch}>
      <div className="flex flex-col gap-6 sm:flex-row">
        <PhotoTile onClick={onPhotoClick} disabled={readOnly} />
        <div className={grid}>
          {mode === "create" ? (
            <TextField
              id="user-username"
              label="Username"
              required
              placeholder="Used to sign in"
              autoComplete="off"
              maxLength={USERNAME_MAX + 8}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              error={errors.username?.message}
              {...register("username")}
            />
          ) : (
            // Not registered: the username is immutable after creation (ADR-0020 §1).
            <TextField id="user-username" label="Username" required disabled value={username} readOnly />
          )}

          {mode === "view" || superAdmin ? (
            <TextField
              id="user-password"
              label="Password"
              type="password"
              disabled
              readOnly
              value=""
              placeholder={mode !== "view" && superAdmin ? "Change it on the Profile page" : "Must be at least 4 characters"}
            />
          ) : (
            <TextField
              id="user-password"
              label="Password"
              required={mode === "create"}
              type="password"
              placeholder={mode === "edit" ? "Leave blank to keep the current password" : "Must be at least 4 characters"}
              autoComplete="new-password"
              error={errors.password?.message}
              {...register("password")}
            />
          )}
          <div className="hidden xl:block" aria-hidden />

          {readOnly ? (
            <TextField id="user-name" label="Name" required disabled readOnly value={name} />
          ) : (
            <TextField id="user-name" label="Name" required placeholder="Full name" autoComplete="off" maxLength={120} error={errors.name?.message} {...register("name")} />
          )}
          <Controller
            control={control}
            name="phone"
            render={({ field }) => (
              <PhoneField
                id="user-phone"
                label="Phone No."
                readOnly={readOnly}
                value={field.value}
                onChange={readOnly ? noop : field.onChange}
                onBlur={readOnly ? noop : field.onBlur}
                inputRef={field.ref}
                error={errors.phone?.number?.message ?? errors.phone?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="locationIds"
            render={({ field }) => (
              <MultiSelect
                id="user-location"
                label="Location"
                required
                readOnly={readOnly}
                options={locations.options}
                status={locations.status}
                value={field.value}
                onChange={readOnly ? noop : field.onChange}
                onBlur={readOnly ? noop : field.onBlur}
                comboboxRef={field.ref}
                error={errors.locationIds?.message}
              />
            )}
          />
        </div>
      </div>
    </Card>
  );
}
