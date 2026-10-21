"use client";

import type { ReactNode } from "react";
import { Controller, useWatch, type UseFormReturn } from "react-hook-form";
import type { LocationOption } from "../api";
import { USERNAME_MAX, type UserFormValues } from "../schema";
import { Card } from "@/components/ui/card";
import { MultiSelect } from "@/components/ui/multi-select";
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
  /** C-08 photo tile (FE-UP-013), owned by the page because it uploads after Save. */
  photo: ReactNode;
};

const noop = () => {};

const grid = "grid min-w-0 flex-1 grid-cols-1 items-start gap-x-4 gap-y-5 md:grid-cols-2 xl:grid-cols-3";

/**
 * The Active switch, shared by the card and the compact sticky summary. It cannot be turned off for a
 * Super Admin or the signed-in user; `showHint` explains why (the compact summary has no room for it).
 */
export function ActiveSwitch({ id, form, readOnly, superAdmin, isSelf, showHint = true }: {
  id: string;
  form: UseFormReturn<UserFormValues>;
  readOnly: boolean;
  superAdmin: boolean;
  isSelf: boolean;
  showHint?: boolean;
}) {
  const locked = superAdmin || isSelf;
  return (
    <Controller
      control={form.control}
      name="active"
      render={({ field }) => (
        <Switch
          id={id}
          label="Active"
          checked={field.value}
          onChange={field.onChange}
          readOnly={readOnly}
          disabled={!readOnly && locked}
          hint={showHint && !readOnly && locked ? (superAdmin ? "Super Admin is always active" : "You can't deactivate your own account") : undefined}
        />
      )}
    />
  );
}

/**
 * C-06..C-12 Personal Information card, UI revision 2 (rev2-02/03).
 * Username is editable only on create (sign-in name, immutable afterwards).
 * Password is optional on edit (blank = unchanged) and locked for a Super
 * Admin (changed only on the Profile page, ADR-0011). Active cannot be turned
 * off for a Super Admin or the signed-in user.
 */
export function PersonalInformationCard({ mode, form, locations, superAdmin, isSelf, photo }: PersonalInformationCardProps) {
  const {
    control,
    register,
    formState: { errors },
  } = form;
  const [username, name] = useWatch({ control, name: ["username", "name"] });
  const readOnly = mode === "view";

  const activeSwitch = <ActiveSwitch id="user-active" form={form} readOnly={readOnly} superAdmin={superAdmin} isSelf={isSelf} />;

  return (
    <Card title="Personal Information" titleId="personal-information-title" titleClassName="text-gms-heading font-medium text-gms-text" trailing={activeSwitch}>
      <div className="flex flex-col gap-6 sm:flex-row">
        {photo}
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
