"use client";

import { useEffect, useState, type RefObject } from "react";

type EntryLike = Pick<IntersectionObserverEntry, "isIntersecting" | "boundingClientRect" | "rootBounds">;

/** True once the target has scrolled up past the (margin-adjusted) top of the scroll area. */
export function isScrolledPast(entry: EntryLike): boolean {
  return !entry.isIntersecting && entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0);
}

/**
 * Tracks whether `target` has scrolled out of view above `root`, treating the top `offsetPx` of the
 * root as covered (by a sticky bar). Off while `enabled` is false (e.g. the target is not rendered).
 */
export function useScrolledPast(target: RefObject<Element | null>, root: RefObject<Element | null>, offsetPx: number, enabled: boolean): boolean {
  const [past, setPast] = useState(false);

  useEffect(() => {
    const element = target.current;
    if (!enabled || !element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setPast(isScrolledPast(entry)), {
      root: root.current,
      rootMargin: `-${offsetPx}px 0px 0px 0px`,
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [target, root, offsetPx, enabled]);

  return enabled && past;
}
