"use client";

import { Plus, Search, ShieldCheck, X } from "lucide-react";
import { useMemo, useState, type Ref } from "react";
import type { UserList, UserSummary } from "../api";
import { Button, cx, focusRing } from "@/components/ui/button";
import { CountBadge } from "@/components/ui/card";

export const USERS_DRAWER_ID = "users-drawer";

type UsersDrawerProps = {
  open: boolean;
  list: UserList | undefined;
  listStatus: "pending" | "error" | "success";
  listErrorMessage?: string;
  onRetry: () => void;
  selectedUserId: string | null;
  onSelectDraft: () => void;
  onSelectUser: (user: UserSummary) => void;
  onClose: () => void;
  closeButtonRef?: Ref<HTMLButtonElement>;
};

const itemBase = "flex w-full items-start gap-3 rounded-gms-md border px-3 py-3 text-left transition-colors";
const itemState = (selected: boolean) =>
  selected ? "border-gms-primary bg-gms-primary-subtle" : "border-transparent hover:bg-gms-surface-sunken";

/** C-16 / C-17: non-modal Users drawer that pushes the content (S1, S2, S5). */
export function UsersDrawer({ open, list, listStatus, listErrorMessage, onRetry, selectedUserId, onSelectDraft, onSelectUser, onClose, closeButtonRef }: UsersDrawerProps) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      (list?.items ?? []).filter(
        (user) => !normalized || user.name.toLowerCase().includes(normalized) || user.email.toLowerCase().includes(normalized),
      ),
    [list, normalized],
  );

  return (
    <aside
      id={USERS_DRAWER_ID}
      aria-label="Users"
      hidden={!open}
      className={cx("w-80 shrink-0 flex-col border-l border-gms-border-drawer bg-gms-surface", open ? "flex" : "hidden")}
    >
      <header className="flex h-[58px] shrink-0 items-center justify-between border-b border-gms-border px-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-gms-text">Users</h2>
          {/* "used / limit" follows the S5 proposal (Q-UP-17). */}
          {list && <CountBadge>{`${list.usage.used} / ${list.usage.limit}`}</CountBadge>}
        </div>
        <button ref={closeButtonRef} type="button" aria-label="Close users panel" onClick={onClose} className={cx("rounded-gms-sm p-1 text-gms-text hover:bg-gms-surface-sunken", focusRing)}>
          <X size={20} aria-hidden />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-2 pt-3">
        <label className="relative block">
          <span className="sr-only">Search users</span>
          <Search size={18} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gms-text" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or username..."
            autoComplete="off"
            className="h-10 w-full rounded-gms-md border border-gms-border bg-gms-surface pl-11 pr-3 text-base text-gms-text outline-none placeholder:text-gms-text-placeholder focus:border-gms-primary focus:ring-2 focus:ring-gms-primary/20"
          />
        </label>

        {list && (
          <p className="mt-3 px-2 text-xs text-gms-text">{`${list.usage.used} of ${list.usage.limit} users added. Super Admin is not counted.`}</p>
        )}

        <ul className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pb-4" aria-label="User list">
          <li>
            <button type="button" aria-current={selectedUserId === null ? "true" : undefined} onClick={onSelectDraft} className={cx(itemBase, itemState(selectedUserId === null), focusRing)}>
              <Plus size={18} className="mt-0.5 shrink-0 text-gms-text" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-gms-text">New user</span>
                <span className="block truncate text-[15px] text-gms-text-secondary">Not saved yet</span>
              </span>
              <span className="shrink-0 rounded-gms-sm bg-gms-warning-subtle px-1.5 py-0.5 text-xs font-medium text-gms-warning-text">Draft</span>
            </button>
          </li>

          {listStatus === "pending" &&
            Array.from({ length: 3 }, (_, index) => (
              <li key={`skeleton-${index}`} aria-hidden className="space-y-2 px-3 py-3">
                <div className="h-4 w-1/2 animate-pulse rounded bg-gms-surface-sunken" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-gms-surface-sunken" />
              </li>
            ))}

          {listStatus === "error" && (
            <li role="alert" className="space-y-2 px-3 py-3">
              <p className="text-sm text-gms-text">{listErrorMessage ?? "Couldn't load users."}</p>
              <Button onClick={onRetry}>Retry</Button>
            </li>
          )}

          {listStatus === "success" &&
            filtered.map((user) => {
              const selected = selectedUserId === user.id;
              return (
                <li key={user.id}>
                  <button type="button" aria-current={selected ? "true" : undefined} onClick={() => onSelectUser(user)} className={cx(itemBase, itemState(selected), focusRing)}>
                    <span
                      aria-hidden
                      className={cx("mt-2 h-2 w-2 shrink-0 rounded-full", user.active ? "bg-gms-primary" : "bg-gms-text-placeholder")}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-gms-text">
                        {user.name}
                        <span className="sr-only">{user.active ? ", active" : ", inactive"}</span>
                      </span>
                      <span className="block truncate text-[15px] text-gms-text-secondary">{user.email}</span>
                    </span>
                    {user.isSuperAdmin && (
                      <span className="shrink-0 text-gms-primary" title="Super Admin">
                        <ShieldCheck size={20} aria-hidden />
                        <span className="sr-only">Super Admin</span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}

          {listStatus === "success" && normalized && filtered.length === 0 && (
            <li className="px-3 py-3 text-sm text-gms-text-secondary">{`No users match "${query.trim()}"`}</li>
          )}
        </ul>
      </div>
    </aside>
  );
}
