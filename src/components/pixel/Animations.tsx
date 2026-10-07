import type { CSSProperties } from "react"

import { PixelSvg, Sprite } from "@/components/pixel/Sprite"
import {
  ARROW_UP,
  BALL,
  BALL_BOY_A,
  BALL_BOY_B,
  DIGITS,
  PLAYER_CHEER,
  PLAYER_READY,
  PLAYER_SWING,
  RACKET,
} from "@/components/pixel/sprites"
import { cn } from "@/lib/utils"
import "@/components/pixel/pixel.css"

/* 1 ------------------------------------------------------------------ */

/** Landing: two players rallying over the net. The ball bounces once on each side. */
export function PixelRally({ className }: { className?: string }) {
  return (
    <PixelSvg w={100} h={40} className={cn("w-full", className)}>
      {/* baseline + net */}
      <rect x={0} y={37} width={100} height={1} fill="var(--color-chalk)" opacity={0.8} />
      <rect x={49} y={27} width={1} height={10} fill="var(--color-chalk)" />
      <rect x={50} y={28} width={1} height={9} fill="var(--color-ink)" opacity={0.35} />
      <rect x={48} y={27} width={4} height={1} fill="var(--color-chalk)" />

      {/* left player */}
      <Sprite rows={PLAYER_READY} x={2} y={22} className="px-rally-ready" />
      <Sprite rows={PLAYER_SWING} x={2} y={22} className="px-rally-swing px-transient" />
      {/* right player (mirrored), half a loop later */}
      <Sprite rows={PLAYER_READY} x={83} y={22} flip className="px-rally-ready px-rally-other" />
      <Sprite rows={PLAYER_SWING} x={83} y={22} flip className="px-rally-swing px-rally-other px-transient" />

      {/* "pok" sparks at each racket */}
      <g className="px-rally-swing px-transient">
        <rect x={18} y={25} width={1} height={1} fill="var(--color-chalk)" />
        <rect x={19} y={30} width={1} height={1} fill="var(--color-chalk)" />
      </g>
      <g className="px-rally-swing px-rally-other px-transient">
        <rect x={81} y={25} width={1} height={1} fill="var(--color-chalk)" />
        <rect x={80} y={30} width={1} height={1} fill="var(--color-chalk)" />
      </g>

      {/* bounce puffs */}
      <g className="px-rally-puff px-transient">
        <rect x={64} y={36} width={1} height={1} fill="var(--color-chalk)" />
        <rect x={68} y={36} width={1} height={1} fill="var(--color-chalk)" />
      </g>
      <g className="px-rally-puff px-rally-other px-transient">
        <rect x={30} y={36} width={1} height={1} fill="var(--color-chalk)" />
        <rect x={34} y={36} width={1} height={1} fill="var(--color-chalk)" />
      </g>

      {/* ball + its shadow on the court */}
      <g className="px-rally-shadow">
        <rect x={16} y={36} width={3} height={1} fill="var(--color-ink)" opacity={0.35} />
      </g>
      <g className="px-rally-ball">
        <rect x={16} y={27} width={2} height={2} fill="var(--color-ball)" />
      </g>
    </PixelSvg>
  )
}

/* 2 ------------------------------------------------------------------ */

const CONFETTI: { dx: number; dy: number; c: string; d: number }[] = [
  { dx: -14, dy: -12, c: "var(--color-ball)", d: 0 },
  { dx: -9, dy: -18, c: "var(--color-chalk)", d: 0.05 },
  { dx: -3, dy: -20, c: "var(--color-ball)", d: 0.1 },
  { dx: 4, dy: -19, c: "var(--color-chalk)", d: 0 },
  { dx: 10, dy: -16, c: "var(--color-ball)", d: 0.08 },
  { dx: 15, dy: -10, c: "var(--color-chalk)", d: 0.03 },
  { dx: -17, dy: -4, c: "var(--color-chalk)", d: 0.12 },
  { dx: 18, dy: -3, c: "var(--color-ball)", d: 0.12 },
  { dx: -6, dy: -9, c: "var(--color-ball)", d: 0.18 },
  { dx: 7, dy: -8, c: "var(--color-chalk)", d: 0.2 },
]

/** Burst of tiny balls from a point (wrap around a "gagné" tag, or behind the cheering player). */
export function BallConfetti({ className }: { className?: string }) {
  return (
    <PixelSvg w={40} h={30} className={cn("pointer-events-none", className)}>
      {CONFETTI.map((p, i) => (
        <rect
          key={i}
          x={19}
          y={20}
          width={i % 3 === 0 ? 2 : 1}
          height={i % 3 === 0 ? 2 : 1}
          fill={p.c}
          className="px-confetti px-transient"
          style={{ "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, "--delay": `${p.d}s` } as CSSProperties}
        />
      ))}
    </PixelSvg>
  )
}

/** Pick won: the player jumps with the racket up, balls fly. Plays once (remount to replay). */
export function PixelWin({ className }: { className?: string }) {
  return (
    <div className={cn("relative w-40", className)}>
      <PixelSvg w={40} h={30} className="w-full">
        <rect x={6} y={28} width={28} height={1} fill="var(--color-chalk)" opacity={0.8} />
        <Sprite rows={PLAYER_CHEER} x={12} y={14} className="px-jump" />
      </PixelSvg>
      <BallConfetti className="absolute inset-0 w-full" />
    </div>
  )
}

/* 3 ------------------------------------------------------------------ */

/** Pick lost: the ball clips the net tape, the net shakes, the ball drops. Plays once. */
export function PixelNetFault({ className }: { className?: string }) {
  return (
    <PixelSvg w={50} h={32} className={cn("w-48", className)}>
      <rect x={0} y={30} width={50} height={1} fill="var(--color-chalk)" opacity={0.8} />
      {/* net: posts, mesh, tape */}
      <rect x={27} y={13} width={1} height={17} fill="var(--color-chalk)" />
      <g className="px-net-tape">
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x={28} y={15 + i * 2} width={1} height={1} fill="var(--color-chalk)" opacity={0.5} />
        ))}
        <rect x={25} y={13} width={5} height={1} fill="var(--color-chalk)" />
      </g>
      <g className="px-net-ball">
        <Sprite rows={BALL} x={2} y={4} />
      </g>
    </PixelSvg>
  )
}

/* 6 ------------------------------------------------------------------ */

/** Loading: a ball bouncing on the line, its shadow shrinking as it rises. */
export function PixelLoader({ label = "Chargement…", className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn("flex flex-col items-center gap-3 py-10", className)}>
      <PixelSvg w={12} h={16} className="w-9">
        <rect x={3} y={14} width={6} height={1} fill="var(--color-ink)" className="px-bounce-shadow" />
        <g className="px-bounce">
          <Sprite rows={BALL} x={4} y={10} />
        </g>
      </PixelSvg>
      <span className="micro-label">{label}</span>
    </div>
  )
}

/* 7 ------------------------------------------------------------------ */

/** A ball boy running along the bottom edge of the lock box (last hour before a lock). */
export function BallBoyRun({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("relative h-7 overflow-hidden", className)}>
      <div className="px-run px-transient absolute bottom-0 w-[30px]">
        <PixelSvg w={10} h={9} className="w-full">
          <Sprite rows={BALL_BOY_A} className="px-step" />
          <Sprite rows={BALL_BOY_B} className="px-step-inv" />
        </PixelSvg>
      </div>
    </div>
  )
}

/** Shot-clock style countdown in pixel digits (mm:ss). Blinks in the last 10 minutes. */
export function ShotClock({ ms, className }: { ms: number; className?: string }) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const text = `${String(Math.min(99, Math.floor(s / 60))).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
  const urgent = ms < 10 * 60_000
  let x = 0
  const glyphs = [...text].map((ch, i) => {
    const g = (
      <Sprite key={i} rows={DIGITS[ch]} x={x} y={1} className={ch === ":" ? "px-blink" : undefined} />
    )
    x += DIGITS[ch][0].length + 1
    return g
  })
  return (
    <span
      role="timer"
      aria-label={`${Math.floor(s / 60)} min ${s % 60} s`}
      className={cn("inline-block bg-ink px-2 py-1.5", urgent && "px-blink", className)}
    >
      <PixelSvg w={x - 1} h={7} className="h-7 w-auto">
        {glyphs}
      </PixelSvg>
    </span>
  )
}

/* 9 ------------------------------------------------------------------ */

/** Little pixel arrow that keeps nudging up next to a rank that just improved. */
export function ClimbArrow({ className }: { className?: string }) {
  return (
    <PixelSvg w={5} h={5} className={cn("w-3", className)}>
      <Sprite rows={ARROW_UP} className="px-arrow" />
    </PixelSvg>
  )
}

const METAL = { 1: "#e9b949", 2: "#c9ccd1", 3: "#c0763b" } as const

/** Top 3 of the season: steps of a podium, each with a racket in gold / silver / bronze. */
export function PixelPodium({ names, className }: { names: [string, string, string]; className?: string }) {
  const places = [
    { rank: 2 as const, h: 18, name: names[1] },
    { rank: 1 as const, h: 26, name: names[0] },
    { rank: 3 as const, h: 12, name: names[2] },
  ]
  return (
    <div className={cn("grid grid-cols-3 items-end gap-2", className)}>
      {places.map((p) => (
        <div key={p.rank} className="flex flex-col items-center">
          <PixelSvg w={5} h={9} className="mb-1 w-5">
            <Sprite
              rows={RACKET}
              className="px-hop"
              style={{ "--px-metal": METAL[p.rank], "--delay": `${p.rank * 0.25}s` } as CSSProperties}
            />
          </PixelSvg>
          <span className="mb-1 w-full truncate text-center text-sm font-medium">{p.name}</span>
          <div
            className="flex w-full items-start justify-center border-2 border-chalk/90 bg-brick/40 pt-1 font-display text-xl"
            style={{ height: p.h * 3 }}
          >
            {p.rank}
          </div>
        </div>
      ))}
    </div>
  )
}
