import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { AppShell, Box, ErrorBox, Loading, PageTitle } from "@/components/court/AppShell"
import { useAuth } from "@/lib/auth"
import { POINTS_PER_ROUND, POINTS_PER_WIN, fetchSeasons, rankSeason, seasonsOf, type SeasonRow } from "@/lib/season"
import { displayName } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

export default function Season() {
  const { session } = useAuth()
  const uid = session?.user.id
  const [rows, setRows] = useState<SeasonRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [chosen, setChosen] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    fetchSeasons()
      .then((r) => active && setRows(r))
      .catch((e: Error) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [reload])

  const seasons = rows ? seasonsOf(rows) : []
  const season = chosen ?? seasons[0] ?? new Date().getFullYear()
  const ranked = rankSeason((rows ?? []).filter((r) => r.season === season))
  const me = ranked.find((r) => r.user_id === uid)

  return (
    <AppShell>
      <PageTitle eyebrow="Classement général">Saison {season}</PageTitle>
      <p className="-mt-2 mb-6 text-sm text-chalk/85">
        {POINTS_PER_ROUND} pts par tour gagné · +{POINTS_PER_WIN} par tournoi remporté. Les tours repêchés ne rapportent rien.
      </p>

      {seasons.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {seasons.map((s) => (
            <button
              key={s}
              onClick={() => setChosen(s)}
              className={cn(
                "min-h-11 rounded-[2px] border-2 px-3 text-sm font-bold tabular-nums",
                s === season ? "border-chalk bg-chalk text-ink" : "border-chalk/60 hover:bg-chalk/10",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <ErrorBox message={error} onRetry={() => setReload((n) => n + 1)} />}
      {!rows && !error && <Loading />}

      {rows && me && (
        <Box className="mb-6 flex items-end justify-between gap-4 px-4 py-4">
          <div>
            <span className="micro-label">Ma place</span>
            <p className="mt-1 font-display text-4xl leading-none tabular-nums">
              {me.rank}
              <span className="text-xl">{me.rank === 1 ? "er" : "e"}</span>
              {me.tied && <span className="ml-2 align-middle text-sm font-sans">ex æquo</span>}
            </p>
            <p className="mt-1 text-sm text-chalk/85">sur {plural(ranked.length, "joueur", "joueurs")}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-4xl leading-none tabular-nums">{me.points}</p>
            <p className="mt-1 text-sm text-chalk/85">points</p>
          </div>
        </Box>
      )}

      {rows && ranked.length === 0 && (
        <p className="border-2 border-dashed border-chalk/60 px-4 py-6 text-center text-chalk/90">
          Pas encore de points cette saison.{" "}
          <Link to="/tournois" className="inline-block py-3 underline underline-offset-4">
            Voir les tournois
          </Link>
        </p>
      )}

      {ranked.length > 0 && (
        <ol className="border-2 border-chalk/90">
          {ranked.map((r) => {
            const mine = r.user_id === uid
            return (
              <li
                key={r.user_id}
                className={cn(
                  "flex items-center gap-3 border-t-2 border-chalk/50 px-3 py-3 first:border-t-0",
                  mine && "bg-brick/35 shadow-[inset_4px_0_0_var(--color-chalk)]",
                )}
              >
                <span className="w-7 shrink-0 text-sm font-bold tabular-nums">{r.rank}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {displayName(r)}
                    {mine && <span className="ml-1.5 text-xs opacity-75">(moi)</span>}
                  </p>
                  <p className="text-xs text-chalk/80">
                    {plural(r.rounds_won, "tour gagné", "tours gagnés")} · {plural(r.tournaments_played, "tournoi", "tournois")}
                    {r.tournaments_won > 0 && ` · ${plural(r.tournaments_won, "victoire", "victoires")}`}
                  </p>
                </div>
                <span className="shrink-0 text-right">
                  <span className="font-display text-2xl tabular-nums">{r.points}</span>
                  <span className="ml-1 text-xs text-chalk/80">pts</span>
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </AppShell>
  )
}
