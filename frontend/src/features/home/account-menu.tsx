"use client";

import { UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { authTrpc } from "@/lib/auth-trpc";

/** `username` is the identity (ADR-0020); the session `email` is internal and never shown. */
export type AccountMenuUser = { name: string; username: string };

/** "Super Admin" -> "SA"; a single word gives its first two letters. */
export function userInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const itemClass =
  "flex h-9 w-full items-center px-3 text-left text-gms-body outline-none transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gms-primary";
const linkItemClass = `${itemClass} text-gms-text hover:bg-gms-nav-active focus:bg-gms-nav-active`;

/**
 * Avatar menu button (APG menu button pattern), laid out as the owner's top-navbar image
 * (2026-10-14): username (was email, ADR-0020) + role, Settings, User and permission, Sign out. Enter/Space/ArrowDown
 * open on the first item, ArrowUp on the last; arrows/Home/End move; Escape closes and
 * returns focus; Tab closes.
 *
 * Role and the "User and permission" item come from `permission.mine` (same query key as the
 * user-permission page). The item is shown only to a confirmed Super Admin; the page and the
 * backend still enforce access.
 */
export function AccountMenu({ user, onSignOut }: Readonly<{ user: AccountMenuUser; onSignOut: () => void | Promise<void> }>) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef<"first" | "last">("first");
  const menuId = useId();
  const initials = userInitials(user.name);
  const mine = authTrpc.permission.mine.useQuery(undefined, { staleTime: 30_000, retry: false });
  const isSuperAdmin = mine.data?.isSuperAdmin === true;
  const roleLabel = mine.data ? (mine.data.isSuperAdmin ? "Super Admin" : "User") : null;

  const menuItems = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  useEffect(() => {
    if (!isOpen) return;
    const items = menuItems();
    (focusOnOpen.current === "last" ? items.at(-1) : items[0])?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  function open(focus: "first" | "last") {
    focusOnOpen.current = focus;
    setIsOpen(true);
  }

  function close(returnFocus: boolean) {
    setIsOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function handleButtonKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      open(event.key === "ArrowUp" ? "last" : "first");
    }
  }

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const items = menuItems();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const move = (next: number) => {
      event.preventDefault();
      items[(next + items.length) % items.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        return move(index + 1);
      case "ArrowUp":
        return move(index - 1);
      case "Home":
        return move(0);
      case "End":
        return move(items.length - 1);
      case "Escape":
        event.preventDefault();
        return close(true);
      case "Tab":
        return close(false);
    }
  }

  async function handleSignOut() {
    setIsOpen(false);
    await onSignOut();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (isOpen ? close(false) : open("first"))}
        onKeyDown={handleButtonKeyDown}
        aria-label={`Account menu for ${user.name}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-gms-text text-gms-label font-semibold text-gms-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gms-primary"
      >
        {initials || <UserRound aria-hidden size={14} />}
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Account"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-[41px] z-50 w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-gms-md border border-gms-border bg-gms-surface shadow-gms-overlay"
        >
          <div role="none" className="px-3 pb-2.5 pt-3">
            <p className="truncate text-gms-body font-semibold text-gms-text" title={user.username}>
              {user.username}
            </p>
            <p className="mt-0.5 min-h-4 truncate text-gms-label text-gms-text-muted">{roleLabel}</p>
          </div>
          <div role="separator" className="border-t border-gms-border" />
          <div role="none" className="py-1">
            <Link href="/settings/profile" role="menuitem" tabIndex={-1} onNavigate={() => setIsOpen(false)} className={linkItemClass}>
              Settings
            </Link>
            {isSuperAdmin && (
              <Link href="/setup/user-permission" role="menuitem" tabIndex={-1} onNavigate={() => setIsOpen(false)} className={linkItemClass}>
                User and permission
              </Link>
            )}
          </div>
          <div role="separator" className="border-t border-gms-border" />
          <div role="none" className="py-0.5">
            <button type="button" role="menuitem" tabIndex={-1} onClick={handleSignOut} className={`${itemClass} text-gms-danger hover:bg-gms-danger-subtle focus:bg-gms-danger-subtle`}>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
