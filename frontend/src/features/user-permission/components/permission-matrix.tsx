"use client";

import { ChevronDown } from "lucide-react";
import { Fragment, useState } from "react";
import { PERMISSION_ACTIONS, type PermissionAction, type PermissionMenu } from "../api";
import { aggregateState, applicableKeys, toggleKeys, type PermissionValues } from "../permission-utils";
import { cx, focusRing } from "./ui/button";
import { ReadOnlyCheck, TriStateCheckbox } from "./ui/checkbox";

/** Header text as shown in the source ("Price" is mixed case; Q-UP-26). */
const actionHeader: Record<PermissionAction, string> = {
  VIEW: "VIEW",
  ADD: "ADD",
  EDIT: "EDIT",
  DELETE: "DELETE",
  CANCEL: "CANCEL",
  PRICE: "Price",
};

type PermissionMatrixProps = {
  catalog: readonly PermissionMenu[];
  values: PermissionValues;
  /** Omit for the read-only view of a saved user. */
  onChange?: (values: PermissionValues) => void;
};

/**
 * C-13 PermissionMatrix. Group and Select All states are derived from leaf
 * cells; non-applicable cells are not rendered as checkboxes and are not
 * counted. No implied rules between actions are applied (Q-UP-13).
 */
export function PermissionMatrix({ catalog, values, onChange }: PermissionMatrixProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  function toggleGroup(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** One row of cells; `menus` are the leaf/group menus this row aggregates. */
  function cells(label: string, menus: readonly PermissionMenu[], className?: string) {
    return PERMISSION_ACTIONS.map((action) => {
      const keys = applicableKeys(menus, action);
      const state = aggregateState(keys, values);
      const name = `${label} ${actionHeader[action]}`;
      return (
        <td key={action} className={cx("text-center align-middle", className)}>
          {state === null ? (
            <span className="sr-only">{`${name}: not applicable`}</span>
          ) : onChange ? (
            <TriStateCheckbox label={name} state={state} onToggle={() => onChange(toggleKeys(keys, values))} />
          ) : (
            <ReadOnlyCheck label={name} state={state} />
          )}
        </td>
      );
    });
  }

  return (
    <table className="w-full table-fixed border-separate border-spacing-0 text-[15px] text-gms-text">
      <colgroup>
        <col className="w-[28%]" />
        {PERMISSION_ACTIONS.map((action) => <col key={action} className="w-[12%]" />)}
      </colgroup>
      <thead>
        <tr>
          <th scope="col" className="sticky top-0 z-10 h-[38px] border-b border-gms-border bg-gms-page pl-3 text-left text-sm font-medium uppercase">
            Menu
          </th>
          {PERMISSION_ACTIONS.map((action) => (
            <th key={action} scope="col" className="sticky top-0 z-10 h-[38px] border-b border-gms-border bg-gms-page text-center text-sm font-medium">
              {actionHeader[action]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr className="bg-gms-surface-muted">
          <th scope="row" className="h-[39px] pl-11 text-left font-semibold">Select All</th>
          {cells("Select All", catalog)}
        </tr>
        {catalog.map((menu) => {
          const children = menu.children ?? [];
          const isGroup = children.length > 0;
          const isCollapsed = collapsed.has(menu.id);
          return (
            <Fragment key={menu.id}>
              <tr>
                <th scope="row" className="h-12 border-b border-gms-border pl-6 text-left font-semibold">
                  <div className="flex items-center">
                    <span className="inline-flex w-6 shrink-0">
                      {isGroup && (
                        <button
                          type="button"
                          aria-expanded={!isCollapsed}
                          aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${menu.label}`}
                          onClick={() => toggleGroup(menu.id)}
                          className={cx("-ml-1 rounded-gms-sm p-0.5 text-gms-text", focusRing)}
                        >
                          <ChevronDown size={16} aria-hidden className={cx("transition-transform", isCollapsed && "-rotate-90")} />
                        </button>
                      )}
                    </span>
                    <span className="truncate">{menu.label}</span>
                    {isGroup && (
                      <span className="ml-3 inline-flex h-6 shrink-0 items-center rounded-gms-sm bg-gms-page px-2 text-xs font-normal text-gms-text">
                        {`${children.length} sub-menus`}
                      </span>
                    )}
                  </div>
                </th>
                {cells(menu.label, [menu], "border-b border-gms-border")}
              </tr>
              {isGroup &&
                !isCollapsed &&
                children.map((child) => (
                  <tr key={child.id}>
                    <th scope="row" className="h-10 truncate border-b border-gms-border pl-[72px] text-left font-normal text-gms-text-secondary">
                      {child.label}
                    </th>
                    {cells(child.label, [child], "border-b border-gms-border")}
                  </tr>
                ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
