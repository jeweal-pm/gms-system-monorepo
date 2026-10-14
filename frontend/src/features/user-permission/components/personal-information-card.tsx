"use client";

import { ImagePlus } from "lucide-react";
import { Controller, type UseFormReturn } from "react-hook-form";
import type { LocationOption, UserDetail } from "../api";
import type { UserFormValues } from "../schema";
import { cx, focusRing } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MultiSelect } from "./ui/multi-select";
import { TextField } from "@/components/ui/outlined-field";
import { PhoneField } from "@/components/ui/phone-field";
import { Switch } from "@/components/ui/switch";

type LocationsState = { options: readonly LocationOption[]; status: "loading" | "error" | "ready" };

type PersonalInformationCardProps =
  | { mode: "draft"; form: UseFormReturn<UserFormValues>; locations: LocationsState; onPhotoClick: () => void }
  | { mode: "view"; user: UserDetail | undefined; locations: LocationsState; onPhotoClick: () => void };

const noop = () => {};

/** Photo tile layout only (C-08); upload wiring is FE-UP-013 (requires-sa, Q-UP-11). */
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
      <span className="text-[13px] font-semibold text-gms-text">Upload photo</span>
      <span className="text-xs text-gms-text-secondary">JPEG or PNG only</span>
    </button>
  );
}

const grid = "grid min-w-0 flex-1 grid-cols-1 items-start gap-x-4 gap-y-5 md:grid-cols-2 xl:grid-cols-3";

/** C-06..C-12: Personal Information card (FE-UP-004 layout, FE-UP-005 validation). */
export function PersonalInformationCard(props: PersonalInformationCardProps) {
  const { locations, onPhotoClick } = props;

  if (props.mode === "view") {
    const { user } = props;
    return (
      <Card
        title="Personal Information"
        titleId="personal-information-title"
        trailing={<Switch id="user-active" label="Active" checked={user?.active ?? false} onChange={noop} readOnly />}
      >
        {user ? (
          <div className="flex flex-col gap-6 sm:flex-row">
            <PhotoTile onClick={onPhotoClick} disabled />
            <div className={grid}>
              <TextField id="user-username" label="Username" required readOnly value={user.email} />
              {/* Passwords are never returned or displayed. */}
              <TextField id="user-password" label="Password" required readOnly value="" placeholder="Hidden" type="password" />
              <div className="hidden xl:block" aria-hidden />
              <TextField id="user-name" label="Name" required readOnly value={user.name} />
              <PhoneField id="user-phone" label="Phone No." required readOnly value={user.phone} onChange={noop} onBlur={noop} />
              <MultiSelect id="user-location" label="Location" required readOnly options={locations.options} status={locations.status} value={user.locationIds} onChange={noop} onBlur={noop} />
            </div>
          </div>
        ) : (
          <div aria-busy="true" aria-label="Loading user" className="flex gap-6">
            <div className="h-[120px] w-[120px] animate-pulse rounded-gms-md bg-gms-surface-sunken" />
            <div className={grid}>
              {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-[52px] animate-pulse rounded-gms-md bg-gms-surface-sunken" />)}
            </div>
          </div>
        )}
      </Card>
    );
  }

  const { form } = props;
  const {
    control,
    register,
    formState: { errors },
  } = form;

  return (
    <Card
      title="Personal Information"
      titleId="personal-information-title"
      trailing={
        // Stays on: inactive accounts are not blocked at sign-in until BE-UP-011 ships, so create always sends active: true.
        <Switch id="user-active" label="Active" checked onChange={noop} disabled hint="Deactivating users isn't available yet" />
      }
    >
      <div className="flex flex-col gap-6 sm:flex-row">
        <PhotoTile onClick={onPhotoClick} />
        <div className={grid}>
          <TextField
            id="user-username"
            label="Username"
            required
            placeholder="Email used to sign in"
            autoComplete="username"
            inputMode="email"
            maxLength={254}
            spellCheck={false}
            autoCapitalize="none"
            error={errors.username?.message}
            {...register("username")}
          />
          <TextField
            id="user-password"
            label="Password"
            required
            type="password"
            placeholder="Must be at least 4 characters"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register("password")}
          />
          <div className="hidden xl:block" aria-hidden />
          <TextField id="user-name" label="Name" required placeholder="Full name" autoComplete="name" maxLength={120} error={errors.name?.message} {...register("name")} />
          <Controller
            control={control}
            name="phone"
            render={({ field }) => (
              <PhoneField
                id="user-phone"
                label="Phone No."
                required
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
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
                options={locations.options}
                status={locations.status}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
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
