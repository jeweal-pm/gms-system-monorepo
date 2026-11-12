import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { animateRemoval, flipTransform, prefersReducedMotion } from "@/features/quotation/components/items/photo-motion";

/** UT-PH-M01…M04: photo grid motion (owner 2026-11-10, "PhotoGrid" sample). */
describe("photo grid motion", () => {
  it("UT-PH-M01 FLIP: a moved tile starts where it was; an unmoved tile doesn't animate", () => {
    const at = { left: 0, top: 0, width: 100, height: 100 };
    expect(flipTransform(at, at)).toBeNull();
    expect(flipTransform({ left: 110, top: 0, width: 100, height: 100 }, at)).toBe("translate(110px, 0px) scale(1, 1)");
    // A small tile promoted to the big tile grows from its old size.
    expect(flipTransform({ left: 300, top: 0, width: 80, height: 80 }, { left: 0, top: 0, width: 200, height: 170 })).toBe("translate(300px, 0px) scale(0.4, 0.47058823529411764)");
  });

  it("UT-PH-M02 without a browser (or with reduced motion) removal happens at once", () => {
    expect(prefersReducedMotion()).toBe(false);
    const done = vi.fn();
    animateRemoval(null, "a", done);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("UT-PH-M03 tiles carry the hooks the motion needs: ids, crown, drag states, hover zoom, add-tile turn", () => {
    const source = readFileSync("src/features/quotation/components/items/LinePhotosField.tsx", "utf8");
    expect(source).toContain("data-photo-id={photo.id}");
    expect(source).toMatch(/<span\s+data-crown/);
    expect(source).toContain('over && "gms-photo-over"');
    expect(source).toContain('dragPhase === "lift" && "z-10 scale-[1.03] shadow-[0_12px_28px_rgba(16,40,40,.22)]"');
    expect(source).toContain('dragPhase === "dragging" && "scale-[.96] opacity-35"');
    expect(source).toContain("group-hover:scale-[1.04]");
    expect(source).toContain("group-enabled/add:group-hover/add:rotate-90");
    expect(source).not.toContain("Set as default");
    expect(source).toContain("usePhotoMotion(gridRef, photos.map((photo) => photo.id), photos[0]?.id, index)");
    expect(readFileSync("src/features/quotation/components/items/ItemEditorPanel.tsx", "utf8")).toContain("useCountBump(ref, count, row)");
  });

  it("UT-PH-M06 removing the default photo: the faded-out end state is released and the main tile is keyed by photo", async () => {
    const cancel = vi.fn();
    const element = { style: { pointerEvents: "" }, animate: vi.fn(() => ({ finished: Promise.resolve(), cancel })) };
    const container = { querySelector: vi.fn(() => element) } as unknown as HTMLElement;
    const frames: (() => void)[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => frames.push(callback));
    const done = vi.fn();
    animateRemoval(container, "main", done);
    expect(element.style.pointerEvents).toBe("none");
    await Promise.resolve();
    await Promise.resolve();
    expect(done).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    frames.forEach((frame) => frame());
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(element.style.pointerEvents).toBe("");
    vi.unstubAllGlobals();
    const source = readFileSync("src/features/quotation/components/items/LinePhotosField.tsx", "utf8");
    expect(source).toMatch(/<PhotoTile\s+\/\/[^\n]*\n\s+key=\{main\.id\}\s+photo=\{main\}/);
  });

  it("UT-PH-M05 a drop ends the drag (the dragged tile may be gone before dragend, leaving the new main photo faded)", () => {
    const source = readFileSync("src/features/quotation/components/items/LinePhotosField.tsx", "utf8");
    const onDrop = source.slice(source.indexOf("onDrop: (event: DragEvent) => {"), source.indexOf("const id = event.dataTransfer.getData(PHOTO_DRAG_TYPE);"));
    expect(onDrop).toContain("endDrag();");
    expect(source.indexOf("const endDrag")).toBeLessThan(source.indexOf("const dropProps"));
  });

  it("UT-PH-M04 the pulse keyframes exist (no drag pill) and stop under reduced motion", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/@keyframes gms-photo-pulse/);
    expect(css).toMatch(/\.gms-photo-over \{[^}]*animation: gms-photo-pulse 1s ease-in-out infinite;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.gms-photo-over \{\s*animation: none;/);
    expect(css).not.toContain("gms-photo-pill");
  });
});
