"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Photo grid motion (owner 2026-11-10, "PhotoGrid" sample): tiles slide to their new place when the order changes
 * (FLIP), new photos zoom in, removed ones zoom out, the crown pops when the main photo changes and the photo count
 * bumps. Web Animations only (no package); everything is skipped under `prefers-reduced-motion: reduce`.
 */

export const PHOTO_EASE = "cubic-bezier(.2,.8,.2,1)";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Box = { left: number; top: number; width: number; height: number };

/** The FLIP start transform from where a tile was (`from`) to where it is (`to`), or null when it didn't move. */
export function flipTransform(from: Box, to: Box): string | null {
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const sx = to.width ? from.width / to.width : 1;
  const sy = to.height ? from.height / to.height : 1;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return null;
  return `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
}

const selectorFor = (id: string) => `[data-photo-id="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id}"]`;

/**
 * Animates the tiles marked `data-photo-id` inside `containerRef` after each change of `ids` / `mainId`. Positions are
 * kept relative to the container, so scrolling the panel never reads as a move. A new `resetKey` (another row) starts
 * fresh without animating.
 */
export function usePhotoMotion(containerRef: RefObject<HTMLElement | null>, ids: readonly string[], mainId: string | undefined, resetKey: unknown) {
  const boxes = useRef(new Map<string, Box>());
  const lastMain = useRef<string | undefined>(undefined);
  const lastReset = useRef<unknown>(Symbol("unset"));
  const key = ids.join("|");

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const fresh = lastReset.current !== resetKey;
    lastReset.current = resetKey;
    const animate = !fresh && !prefersReducedMotion();
    const origin = container.getBoundingClientRect();
    const next = new Map<string, Box>();
    for (const element of container.querySelectorAll<HTMLElement>("[data-photo-id]")) {
      const id = element.dataset.photoId ?? "";
      const rect = element.getBoundingClientRect();
      const box = { left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width, height: rect.height };
      next.set(id, box);
      if (!animate || typeof element.animate !== "function") continue;
      const before = boxes.current.get(id);
      if (before) {
        const transform = flipTransform(before, box);
        if (transform) element.animate([{ transform, transformOrigin: "top left" }, { transform: "none", transformOrigin: "top left" }], { duration: 320, easing: PHOTO_EASE });
      } else {
        element.animate([{ opacity: 0, transform: "scale(.85)" }, { opacity: 1, transform: "none" }], { duration: 350, easing: PHOTO_EASE });
      }
    }
    if (animate && mainId && lastMain.current && lastMain.current !== mainId) {
      const crown = container.querySelector<HTMLElement>("[data-crown]");
      crown?.animate?.(
        [
          { transform: "scale(.4) rotate(-20deg)", opacity: 0 },
          { transform: "scale(1.2) rotate(6deg)", opacity: 1, offset: 0.6 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 600, easing: PHOTO_EASE },
      );
    }
    boxes.current = next;
    lastMain.current = mainId;
    // `key` stands for `ids`; positions are only re-read when the photos or the row change.
  }, [containerRef, key, mainId, resetKey]);
}

/** Zooms a tile out, then runs `done` (immediately under reduced motion or without Web Animations). */
export function animateRemoval(container: HTMLElement | null, id: string, done: () => void) {
  const element = container?.querySelector<HTMLElement>(selectorFor(id));
  if (!element || prefersReducedMotion() || typeof element.animate !== "function") return done();
  element.style.pointerEvents = "none";
  const animation = element.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.85)" }], { duration: 220, easing: "ease-in", fill: "forwards" });
  // Release the held end state, so the element never stays invisible if React reuses it for another photo.
  const finish = () => {
    done();
    // A frame later React has removed the tile; if it kept the element for another photo, make it visible again.
    requestAnimationFrame(() => {
      animation.cancel();
      element.style.pointerEvents = "";
    });
  };
  animation.finished.then(finish, finish);
}

/** "Photos n / 5": the number bumps when it changes (not on first show or another row). */
export function useCountBump(ref: RefObject<HTMLElement | null>, count: number, resetKey: unknown) {
  const last = useRef<{ count: number; reset: unknown } | null>(null);
  useLayoutEffect(() => {
    const previous = last.current;
    last.current = { count, reset: resetKey };
    if (!previous || previous.reset !== resetKey || previous.count === count || prefersReducedMotion()) return;
    ref.current?.animate?.([{ transform: "none" }, { transform: "scale(1.25)", color: "#0E5E63", offset: 0.4 }, { transform: "none" }], { duration: 400, easing: PHOTO_EASE });
  }, [count, ref, resetKey]);
}
