import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"

type CourtLineProps = {
  /** "h" draws a horizontal line, "v" a vertical one. */
  axis: "h" | "v"
  className?: string
  style?: CSSProperties
  /** Animation delay in ms for the chalk-drawing effect. */
  delay?: number
  /** Where the line starts drawing from. */
  origin?: "start" | "center" | "end"
}

/**
 * A chalk court line. Position it with absolute utilities
 * (e.g. `top-0 inset-x-0`). Worn, powdery edge via a noise mask.
 */
export function CourtLine({
  axis,
  className,
  style,
  delay = 0,
  origin = "start",
}: CourtLineProps) {
  const originClass =
    axis === "h"
      ? { start: "origin-left", center: "origin-center", end: "origin-right" }[origin]
      : { start: "origin-top", center: "origin-center", end: "origin-bottom" }[origin]

  return (
    <span
      aria-hidden="true"
      className={cn(
        "chalk-line pointer-events-none absolute block bg-chalk",
        axis === "h" ? "h-[2px] md:h-[3px] animate-line-x" : "w-[2px] md:w-[3px] animate-line-y",
        originClass,
        className,
      )}
      style={{ animationDelay: `${delay}ms`, ...style }}
    />
  )
}
