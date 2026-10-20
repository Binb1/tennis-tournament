import { useState } from "react"
import { Link } from "react-router-dom"
import { ChevronDown } from "lucide-react"

import { Box } from "@/components/court/AppShell"
import { roundName, t } from "@/lib/i18n"
import { bonusPoints, categoryOf, maxPoints, roundPoints, type Category } from "@/lib/scoring"
import type { Round } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/** The category in its code colour (lib/scoring.ts): "ATP 500", or the short form ("500") when `short`. */
export function CategoryBadge({ category, short = false, className }: { category: Category; short?: boolean; className?: string }) {
  const c = categoryOf(category)
  return (
    <span
      style={{ backgroundColor: c.color }}
      className={cn(
        "inline-flex items-center rounded-[2px] px-2 py-0.5 text-[11px] font-bold tracking-[0.12em] whitespace-nowrap text-ink uppercase [font-stretch:85%]",
        className,
      )}
    >
      {short ? c.short : c.label}
    </span>
  )
}

/** List card: category and the most a player can score. Inside a link, so the explanation is a plain tooltip. */
export function StakeTag({ category, rounds }: { category: Category; rounds: number }) {
  const c = categoryOf(category)
  const max = maxPoints(category, rounds)
  return (
    <span
      title={t("stake.tagTitle", { label: c.label, mult: c.mult, max })}
      className="inline-flex items-center gap-1.5"
    >
      <CategoryBadge category={category} />
      <span className="text-xs font-bold tabular-nums">{max} pts</span>
    </span>
  )
}

/** Tournament page: what's at stake, with the breakdown per round and the bonuses on tap. */
export function StakeCard({ category, rounds }: { category: Category; rounds: Round[] }) {
  const [open, setOpen] = useState(false)
  const c = categoryOf(category)
  const lastIdx = Math.max(0, ...rounds.map((r) => r.idx))
  const bonus = bonusPoints(category)
  const max = maxPoints(category, rounds.length)
  const lines = [
    ...rounds.map((r) => ({ label: t("stake.roundWon", { round: roundName(r.name) }), pts: roundPoints(category, r.idx, lastIdx) })),
    { label: t("stake.lastStanding"), pts: bonus },
    { label: t("stake.goodChampion"), pts: bonus },
  ]

  return (
    <Box className="mb-6 border-l-[6px]" style={{ borderLeftColor: c.color }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-chalk/10"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <CategoryBadge category={category} />
            <span className="micro-label">{t("stake.atStake", { mult: c.mult })}</span>
          </span>
          <span className="mt-1 block font-display text-2xl leading-tight">{t("stake.upTo", { max })}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium">
          {open ? t("stake.hide") : t("stake.details")}
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && (
        <div className="border-t-2 border-chalk/50 px-4 py-3">
          <ul className="space-y-1 text-sm">
            {lines.map((l) => (
              <li key={l.label} className="flex justify-between gap-3">
                <span className="text-chalk/90">{l.label}</span>
                <span className="font-bold tabular-nums">+{l.pts}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-chalk/85">
            {t("stake.explain")}{" "}
            <Link to="/points" className="underline underline-offset-4">
              {t("stake.scaleLink")}
            </Link>
          </p>
        </div>
      )}
    </Box>
  )
}
