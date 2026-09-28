import { useEffect, useRef, useState } from "react"

import { setTheme, THEME_GROUPS, THEMES, useTheme, type ThemeId } from "@/lib/theme"
import { cn } from "@/lib/utils"

/** Court surface picker: one labelled mini court per tournament, Grand Chelem then Masters 1000 (Profile, header menu). */
export function SurfacePicker({ className, onPick }: { className?: string; onPick?: () => void }) {
  const current = useTheme()

  return (
    <div role="radiogroup" aria-label="Surface" className={cn("space-y-3", className)}>
      {THEME_GROUPS.map((g) => (
        <div key={g.id} role="group" aria-label={g.label}>
          <span className="micro-label px-1 pb-1 text-[10px] tracking-[0.2em]">{g.label}</span>
          <div className="grid grid-cols-4 gap-1">
            {THEMES.filter((t) => t.group === g.id).map((t) => {
              const on = t.id === current
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={t.label}
                  onClick={() => {
                    setTheme(t.id)
                    onPick?.()
                  }}
                  className="group flex min-w-0 flex-col items-center gap-1.5 rounded-[2px] px-0.5 py-2 text-center hover:bg-chalk/10"
                >
                  <span
                    className={cn(
                      "block rounded-[2px] outline outline-offset-2 transition-[outline-color]",
                      on ? "outline-2 outline-chalk" : "outline-1 outline-chalk/40 group-hover:outline-chalk/80",
                    )}
                  >
                    <MiniCourt id={t.id} />
                  </span>
                  <span className={cn("text-[11px] leading-tight font-bold tracking-[0.04em] [font-stretch:85%]", on ? "text-chalk" : "text-chalk/80")}>
                    {t.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Header control: a mini court of the current surface, opening the picker in a popover. */
export function SurfaceMenu() {
  const current = useTheme()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    root.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus()
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  function close() {
    setOpen(false)
    trigger.current?.focus()
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Surface : ${THEMES.find((t) => t.id === current)!.label}`}
        onClick={() => setOpen((o) => !o)}
        className="group -mr-1.5 flex min-h-11 min-w-11 items-center justify-center rounded-[2px]"
      >
        <span
          className={cn(
            "block rounded-[2px] outline outline-offset-2 transition-[outline-color]",
            open ? "outline-2 outline-chalk" : "outline-1 outline-chalk/50 group-hover:outline-chalk",
          )}
        >
          <MiniCourt id={current} small />
        </span>
      </button>
      {open && (
        <div
          // Focusable, so a click on a swatch that doesn't take focus (Safari) keeps focus inside instead of closing.
          tabIndex={-1}
          className="wall absolute top-full right-0 z-50 mt-2 max-h-[calc(100svh-5rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-[2px] p-2 shadow-[0_12px_32px_rgb(0_0_0/0.35)] outline outline-1 outline-chalk/25"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
          }}
        >
          <SurfacePicker onPick={close} />
        </div>
      )}
    </div>
  )
}

/** A landscape doubles court, drawn to scale (36 × 18 m, with a 3 m run-off). */
export function MiniCourt({ id, small = false, className }: { id: ThemeId; small?: boolean; className?: string }) {
  const { court, outer, line, stripe } = THEMES.find((t) => t.id === id)!
  return (
    <svg viewBox="0 0 42 24" aria-hidden="true" className={cn("block", small ? "h-[20px] w-[35px]" : "h-[30px] w-[52px]", className)}>
      <rect width="42" height="24" fill={outer} />
      <rect x="3" y="3" width="36" height="18" fill={court} />
      {stripe && [7, 15, 23, 31].map((x) => <rect key={x} x={x} y="0" width="4" height="24" fill={stripe} />)}
      <g fill="none" stroke={line} strokeWidth="0.8">
        <rect x="3" y="3" width="36" height="18" />
        <path d="M3 5.3h36M3 18.7h36M11.4 5.3v13.4M30.6 5.3v13.4M11.4 12h19.2" />
      </g>
      <path d="M21 1.5v21" stroke="#10100c" strokeWidth="1" />
    </svg>
  )
}
