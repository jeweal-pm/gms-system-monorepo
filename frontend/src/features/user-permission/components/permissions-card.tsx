"use client";

import { useMemo } from "react";
import type { PermissionCatalog } from "../api";
import { countEnabled, type PermissionValues } from "../permission-utils";
import { Button } from "./ui/button";
import { Card, CountBadge } from "./ui/card";
import { PermissionMatrix } from "./permission-matrix";

type PermissionsCardProps = {
  catalog: PermissionCatalog | undefined;
  catalogStatus: "pending" | "error" | "success";
  errorMessage?: string;
  onRetry: () => void;
  values: PermissionValues;
  onChange?: (values: PermissionValues) => void;
};

/**
 * Permissions card with the live count badge "{enabled} of {applicableCount} on".
 * The denominator is the catalog's `applicableCount` (v1: 204); the source's
 * static "0 of 53" is Q-UP-02.
 */
export function PermissionsCard({ catalog, catalogStatus, errorMessage, onRetry, values, onChange }: PermissionsCardProps) {
  const enabled = useMemo(() => (catalog ? countEnabled(catalog.menus, values) : null), [catalog, values]);

  return (
    <Card
      title="Permissions"
      titleId="permissions-title"
      badge={catalog && enabled !== null && <CountBadge>{`${enabled} of ${catalog.applicableCount} on`}</CountBadge>}
    >
      {catalogStatus === "pending" && (
        <div aria-busy="true" aria-label="Loading permissions" className="space-y-2">
          <div className="h-[38px] animate-pulse rounded-gms-sm bg-gms-page" />
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-10 animate-pulse rounded-gms-sm bg-gms-surface-sunken" />)}
        </div>
      )}
      {catalogStatus === "error" && (
        <div role="alert" className="flex flex-col items-start gap-3 py-4">
          <p className="text-sm text-gms-text">{errorMessage ?? "Couldn't load the permission list."}</p>
          <Button onClick={onRetry}>Retry</Button>
        </div>
      )}
      {catalogStatus === "success" && catalog && <PermissionMatrix catalog={catalog.menus} values={values} onChange={onChange} />}
    </Card>
  );
}
