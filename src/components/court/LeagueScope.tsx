import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"

import { t } from "@/lib/i18n"
import { fetchMyLeagues, memberIds, type League } from "@/lib/leagues"
import { readSeen, writeSeen } from "@/lib/seen"
import { cn } from "@/lib/utils"

/**
 * Which ranking to show: everyone, or one of my leagues. Starts from `?ligue=<id>` (a league page links there), else
 * the last choice on this device, so the season page and the leaderboards stay on the same league.
 * `members`: null = everyone. A league I left falls back to everyone.
 */
export function useLeagueScope() {
  const [params] = useSearchParams()
  const [leagues, setLeagues] = useState<League[]>([])
  const [chosen, setChosen] = useState<string | null>(() => params.get("ligue") ?? (readSeen("league-scope") || null))

  useEffect(() => {
    let active = true
    // No league switch is no loss: the rankings just show everyone.
    fetchMyLeagues()
      .then((l) => active && setLeagues(l))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const league = leagues.find((l) => l.id === chosen) ?? null
  const choose = (id: string | null) => {
    setChosen(id)
    writeSeen("league-scope", id ?? "")
  }
  const members = useMemo(() => (league ? memberIds(league) : null), [league])
  return { leagues, league, members, choose }
}

/** Chips: "Everyone", then my leagues. Nothing when I'm in no league. */
export function LeagueScope({ scope, className }: { scope: ReturnType<typeof useLeagueScope>; className?: string }) {
  if (scope.leagues.length === 0) return null
  const options: [string | null, string][] = [[null, t("leagues.scopeAll")], ...scope.leagues.map((l): [string, string] => [l.id, l.name])]
  return (
    <div role="radiogroup" aria-label={t("leagues.scopeLabel")} className={cn("flex flex-wrap gap-2", className)}>
      {options.map(([id, label]) => {
        const on = (scope.league?.id ?? null) === id
        return (
          <button
            key={id ?? "all"}
            role="radio"
            aria-checked={on}
            onClick={() => scope.choose(id)}
            className={cn(
              "min-h-11 max-w-full truncate rounded-[2px] border-2 px-3 text-sm font-bold",
              on ? "border-chalk bg-chalk text-ink" : "border-chalk/60 hover:bg-chalk/10",
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
