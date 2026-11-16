"use client";

import { Controller, useFormState, type UseFormReturn } from "react-hook-form";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/outlined-field";
import { Switch } from "@/components/ui/switch";
import { LOCATION_NAME_MAX, type LocationFormValues } from "../schema";

const ID = "location";
/** Same 404 px field column as Stone Master › Size (ui-spec "Layout"). */
const column = "flex w-full max-w-[404px] flex-col gap-5";

/** Location card (ui-spec): Active in the header, one Name field. */
export function LocationFieldsCard({ form, readOnly }: Readonly<{ form: UseFormReturn<LocationFormValues>; readOnly: boolean }>) {
  const { control, register } = form;
  const { errors } = useFormState({ control });

  return (
    <Card
      title="Location"
      titleId={`${ID}-card-title`}
      titleClassName="text-gms-heading font-medium text-gms-text"
      headerClassName="min-h-[65px]"
      className="flex flex-1 flex-col"
      bodyClassName="flex-1"
      trailing={
        <Controller
          control={control}
          name="active"
          render={({ field }) => <Switch id={`${ID}-active`} label="Active" checked={field.value} onChange={field.onChange} readOnly={readOnly} />}
        />
      }
    >
      <div className={column}>
        <TextField
          id={`${ID}-name`}
          label="Name"
          required
          autoComplete="off"
          maxLength={LOCATION_NAME_MAX}
          placeholder="e.g. Safe A"
          readOnly={readOnly}
          error={errors.name?.message}
          {...register("name")}
        />
      </div>
    </Card>
  );
}
