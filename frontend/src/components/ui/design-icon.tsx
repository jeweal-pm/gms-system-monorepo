import type { ComponentType } from "react";

/**
 * Icon contract shared by lucide icons and the design icons: consumers pass lucide's `size` and
 * `strokeWidth`; design icons keep their own stroke weight instead (see `designIcon`).
 */
export type IconProps = { size?: number | string; strokeWidth?: number | string; className?: string; "aria-hidden"?: boolean | "true" | "false" };
export type IconComponent = ComponentType<IconProps>;

/**
 * One path of a design SVG: a string is stroked at the icon's weight; `strokePx` overrides that weight
 * for this path; `filled` paints the shape instead (Figma exports of outlined shapes).
 */
export type DesignPath = string | { d: string; strokePx?: number; filled?: boolean };

/**
 * Builds an icon from a design SVG's path data. Colour is `currentColor` (the design's fixed colour is
 * the surrounding text colour); strokes stay the designer's pixel weight (drawn on the `artboard`-px
 * canvas) at any rendered size.
 */
export function designIcon(displayName: string, paths: readonly DesignPath[], { artboard, strokePx }: { artboard: number; strokePx: number }): IconComponent {
  function Icon({ size = artboard, className, "aria-hidden": ariaHidden }: IconProps) {
    const pixels = typeof size === "number" ? size : Number.parseFloat(size) || artboard;
    const units = (px: number) => (px * artboard) / pixels;
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox={`0 0 ${artboard} ${artboard}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={units(strokePx)}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden={ariaHidden}
        data-icon={displayName}
      >
        {paths.map((path) => {
          if (typeof path === "string") return <path key={path} d={path} />;
          if (path.filled) return <path key={path.d} d={path.d} fill="currentColor" stroke="none" />;
          return <path key={path.d} d={path.d} strokeWidth={path.strokePx === undefined ? undefined : units(path.strokePx)} />;
        })}
      </svg>
    );
  }
  Icon.displayName = displayName;
  return Icon;
}
