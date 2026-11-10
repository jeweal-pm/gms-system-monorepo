"use client";

import Link from "next/link";
import { authTrpc } from "@/lib/auth-trpc";
import { retryTransient } from "@/lib/trpc-error";
import { canViewWith, homeCards, visibleHomeCards, type HomeCard } from "./navigation";

/** Shown when the user may view none of the shortcut menus (user-permission SA rev 3 D3-02). */
export const NO_SHORTCUTS_MESSAGE = "You don't have access to any menu yet. Ask your administrator.";
export const ACCESS_ERROR_MESSAGE = "Couldn't load your menu access. Refresh the page to try again.";

/** True when the access check answered and no shortcut is left (not while loading, not on an error). */
export function hasNoShortcuts(loaded: boolean, cards: readonly HomeCard[] | undefined): boolean {
  return loaded && (cards?.length ?? 0) === 0;
}

export const shortcutCount = (cards: readonly HomeCard[]) => cards.reduce((total, card) => total + card.blocks.reduce((sum, block) => sum + block.links.length, 0), 0);

/**
 * Home shortcuts (owner design 2026-11-09): the sidebar's menus as cards, 4 columns on wide screens. A card with
 * several blocks (Memo, Account, Report) lays them out in two columns; a titled block is a sub-group.
 */
export function HomeDashboard() {
  // Same query and cache as the sidebar (useMenuAccess): a menu without VIEW is not shown.
  const mine = authTrpc.permission.mine.useQuery(undefined, { retry: retryTransient, staleTime: 30_000 });
  const cards = visibleHomeCards(homeCards, (permission) => canViewWith(mine.data, permission));

  return (
    // Gray page with white cards, like the transaction pages (owner 2026-11-09).
    <div className="min-h-full bg-gms-page">
      <div className="mx-auto max-w-[1600px] px-6 pb-10 pt-10 sm:px-10">
        <div className="mb-7">
          <h1 className="text-gms-title font-semibold tracking-tight text-[#19232a]">Shortcuts</h1>
          <p className="mt-1 text-gms-label text-[#84919a]">
            {cards.length} groups · {shortcutCount(cards)} shortcuts
          </p>
        </div>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label="Shortcuts">
          {cards.map((card) => (
            <HomeCardView key={card.id} card={card} />
          ))}
        </section>
        {hasNoShortcuts(mine.isSuccess, cards) && (
          <p role="status" className="rounded-gms-md border border-gms-border bg-gms-surface-muted px-4 py-3 text-gms-body text-gms-text-secondary">
            {NO_SHORTCUTS_MESSAGE}
          </p>
        )}
        {mine.isError && <p className="mt-4 text-gms-label text-amber-700">{ACCESS_ERROR_MESSAGE}</p>}
      </div>
    </div>
  );
}

export function HomeCardView({ card }: Readonly<{ card: HomeCard }>) {
  const twoColumns = card.blocks.length > 1;
  return (
    <article className="min-h-[148px] rounded-[9px] border border-[#d5dfe4] bg-gms-surface px-4 py-4 shadow-[0_1px_2px_rgba(20,40,50,0.02)]">
      <h2 className="mb-3 text-gms-heading font-semibold text-[#1d272d]">{card.title}</h2>
      <div className={twoColumns ? "grid grid-cols-2 gap-x-4 gap-y-3" : undefined}>
        {card.blocks.map((block, index) => (
          <div key={block.title ?? `links-${index}`} className="min-w-0">
            {block.title && <h3 className="pt-1.5 text-xs text-[#84919a]">{block.title}</h3>}
            <ul className="space-y-0.5">
              {block.links.map((entry) => (
                <li key={entry.id}>
                  <Link href={entry.href} className="block truncate rounded px-0 py-1.5 text-gms-label text-[#556874] transition hover:text-[#006c68] hover:underline">
                    {entry.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </article>
  );
}
