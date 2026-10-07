import type { ComponentProps, CSSProperties } from "react"

import { cn } from "@/lib/utils"

/**
 * Pixel sprites: each string is a row, each character a pixel ("." = empty).
 * Colours come from the theme tokens, so every tournament style repaints them.
 */
const PALETTE: Record<string, string> = {
  k: "var(--color-ink)",
  c: "var(--color-chalk)",
  b: "var(--color-ball)",
  d: "var(--color-clay-deep)",
  s: "#e2a676", // skin
  p: "var(--px-shirt, var(--color-chalk))",
  w: "var(--px-shorts, var(--color-ink))",
  m: "var(--px-metal, var(--color-ball))", // podium rackets: gold / silver / bronze
}

/** One <rect> per horizontal run of the same colour (fewer nodes than one per pixel). */
export function Sprite({
  rows,
  x = 0,
  y = 0,
  flip = false,
  className,
  style,
}: {
  rows: string[]
  x?: number
  y?: number
  /** Mirror horizontally (a player facing left). */
  flip?: boolean
  className?: string
  style?: CSSProperties
}) {
  const w = Math.max(...rows.map((r) => r.length))
  const rects = []
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j]
    let i = 0
    while (i < row.length) {
      const ch = row[i]
      let n = 1
      while (row[i + n] === ch) n++
      if (ch !== "." && PALETTE[ch]) rects.push(<rect key={`${j}-${i}`} x={i} y={j} width={n} height={1} fill={PALETTE[ch]} />)
      i += n
    }
  }
  const transform = flip ? `translate(${x + w} ${y}) scale(-1 1)` : `translate(${x} ${y})`
  return (
    <g transform={transform}>
      <g className={className} style={style}>
        {rects}
      </g>
    </g>
  )
}

/** An SVG in pixel units, scaled up without smoothing. */
export function PixelSvg({ w, h, className, children, ...props }: { w: number; h: number } & ComponentProps<"svg">) {
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={cn("block overflow-visible", className)}
      {...props}
    >
      {children}
    </svg>
  )
}
