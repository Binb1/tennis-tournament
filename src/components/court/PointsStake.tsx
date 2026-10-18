import { useState } from "react"
import { Link } from "react-router-dom"
import { ChevronDown } from "lucide-react"

import { Box, Tag } from "@/components/court/AppShell"
import { bonusPoints, categoryOf, maxPoints, roundPoints, type Category } from "@/lib/scoring"
import type { Round } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/** List card: category and the most a player can score. Inside a link, so the explanation is a plain tooltip. */
export function StakeTag({ category, rounds }: { category: Category; rounds: number }) {
  const c = categoryOf(category)
  const max = maxPoints(category, rounds)
  return (
    <span title={`${c.label} : points ×${c.mult}. Jusqu'à ${max} pts avec un parcours parfait, la victoire et le bon pronostic.`}>
      <Tag tone="neutral">
        {c.label} · {max} pts
      </Tag>
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
    ...rounds.map((r) => ({ label: `${r.name} gagné`, pts: roundPoints(category, r.idx, lastIdx) })),
    { label: "Dernier debout", pts: bonus },
    { label: "Bon pronostic du vainqueur", pts: bonus },
  ]

  return (
    <Box className="mb-6">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-chalk/10"
      >
        <span className="min-w-0 flex-1">
          <span className="micro-label">En jeu · {c.label} · points ×{c.mult}</span>
          <span className="mt-1 block font-display text-2xl leading-tight">Jusqu'à {max} pts</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium">
          {open ? "Masquer" : "Détail"}
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
            Chaque tour vaut plus que le précédent, et un tournoi plus prestigieux multiplie tout.{" "}
            <Link to="/points" className="underline underline-offset-4">
              Le barème en images
            </Link>
          </p>
        </div>
      )}
    </Box>
  )
}
