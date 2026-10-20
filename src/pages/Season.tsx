import { useEffect, useState, type CSSProperties } from "react"
import { Link } from "react-router-dom"

import { AppShell, Box, ErrorBox, FindMe, Loading, ME_ROW, PageTitle, SearchInput } from "@/components/court/AppShell"
import { ClimbArrow, PixelPodium } from "@/components/pixel/Animations"
import { useAuth } from "@/lib/auth"
import { t } from "@/lib/i18n"
import { fetchLastReset, fetchSeasons, rankSeason, rankSuffix, seasonsOf, type SeasonRow } from "@/lib/season"
import { readSeen, writeSeen } from "@/lib/seen"
import { displayName, formatDate } from "@/lib/supabase"
import { cn } from "@/lib/utils"

export default function Season() {
  const { session } = useAuth()
  const uid = session?.user.id
  const [rows, setRows] = useState<SeasonRow[] | null>(null)
  const [resetAt, setResetAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [chosen, setChosen] = useState<number | null>(null)
  const [q, setQ] = useState("")
  // My rank per season at my previous visit, read once: a climb since then gets the arrow.
  const [prevRanks] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(readSeen("season-ranks") ?? "{}")
    } catch {
      return {}
    }
  })

  useEffect(() => {
    let active = true
    Promise.all([fetchSeasons(), fetchLastReset()])
      .then(([r, at]) => {
        if (!active) return
        setRows(r)
        setResetAt(at)
      })
      .catch((e: Error) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [reload])

  const seasons = rows ? seasonsOf(rows) : []
  const season = chosen ?? seasons[0] ?? new Date().getFullYear()
  const ranked = rankSeason((rows ?? []).filter((r) => r.season === season))
  const me = ranked.find((r) => r.user_id === uid)
  const climb = me && prevRanks[season] > me.rank ? prevRanks[season] - me.rank : 0
  const myRank = me?.rank
  useEffect(() => {
    if (myRank == null) return
    let saved: Record<string, number> = {}
    try {
      saved = JSON.parse(readSeen("season-ranks") ?? "{}")
    } catch {
      // start over
    }
    writeSeen("season-ranks", JSON.stringify({ ...saved, [season]: myRank }))
  }, [season, myRank])
  const needle = q.trim().toLowerCase()
  const shown = needle ? ranked.filter((r) => displayName(r).toLowerCase().includes(needle)) : ranked

  return (
    <AppShell>
      <PageTitle eyebrow={t("season.eyebrow")}>{t("season.title", { year: season })}</PageTitle>
      <p className="-mt-2 mb-6 text-sm text-chalk/85">
        {t("season.intro")}{" "}
        <Link to="/points" className="underline underline-offset-4">
          {t("season.howToScore")}
        </Link>
      </p>
      {resetAt && new Date(resetAt).getFullYear() === season && (
        <p className="-mt-3 mb-6 border-l-4 border-chalk bg-brick/40 px-4 py-3 text-sm">
          {t("season.resetNote", { date: formatDate(resetAt) })}
        </p>
      )}

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
            <span className="micro-label">{t("season.myRank")}</span>
            <p className="mt-1 font-display text-4xl leading-none tabular-nums">
              {me.rank}
              <span className="text-xl">{rankSuffix(me.rank)}</span>
              {me.tied && <span className="ml-2 align-middle text-sm font-sans">{t("season.tied")}</span>}
              {climb > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 align-middle font-sans text-sm font-bold">
                  <ClimbArrow />+{climb}
                </span>
              )}
            </p>
            <p className="mt-1 text-sm text-chalk/85">{t("season.outOf", { count: ranked.length })}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-4xl leading-none tabular-nums">{me.points}</p>
            <p className="mt-1 text-sm text-chalk/85">{t("season.points")}</p>
          </div>
        </Box>
      )}

      {rows && ranked.length === 0 && (
        <p className="border-2 border-dashed border-chalk/60 px-4 py-6 text-center text-chalk/90">
          {t("season.noPoints")}{" "}
          <Link to="/tournois" className="inline-block py-3 underline underline-offset-4">
            {t("season.seeTournaments")}
          </Link>
        </p>
      )}

      {ranked.length >= 3 && (
        <Box className="mb-6 px-4 pt-4 pb-3">
          <PixelPodium
            names={[displayName(ranked[0]), displayName(ranked[1]), displayName(ranked[2])]}
            ranks={[ranked[0].rank, ranked[1].rank, ranked[2].rank]}
          />
        </Box>
      )}

      {ranked.length > 0 && (
        <div className="mb-3 flex gap-2">
          <div className="flex-1">
            <SearchInput value={q} onChange={setQ} placeholder={t("season.search")} />
          </div>
          {me && <FindMe onFind={() => setQ("")} />}
        </div>
      )}

      {ranked.length > 0 && shown.length === 0 && (
        <p className="border-2 border-dashed border-chalk/60 px-4 py-6 text-center text-chalk/90">{t("season.noneFound")}</p>
      )}

      {shown.length > 0 && (
        <ol className="border-2 border-chalk/90">
          {shown.map((r) => {
            const mine = r.user_id === uid
            // Climbing: my row slides up from where it was (rows are ~66 px), over the others.
            const rising = mine && climb > 0 && !needle
            return (
              <li
                key={r.user_id}
                id={mine ? ME_ROW : undefined}
                className={cn(
                  "flex scroll-mt-24 items-center gap-3 border-t-2 border-chalk/50 px-3 py-3 first:border-t-0",
                  mine && "shadow-[inset_4px_0_0_var(--color-chalk)]",
                  mine && (rising ? "px-climb relative z-10 bg-brick" : "bg-brick/35"),
                )}
                style={rising ? ({ "--from": `${Math.min(climb, 6) * 66}px` } as CSSProperties) : undefined}
              >
                <span className="w-7 shrink-0 text-sm font-bold tabular-nums">{r.rank}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {displayName(r)}
                    {mine && <span className="ml-1.5 text-xs opacity-75">{t("season.me")}</span>}
                  </p>
                  <p className="text-xs text-chalk/80">
                    {t("season.roundsWon", { count: r.rounds_won })} · {t("season.tournaments", { count: r.tournaments_played })}
                    {r.tournaments_won > 0 && ` · ${t("season.titles", { count: r.tournaments_won })}`}
                  </p>
                </div>
                <span className="shrink-0 text-right">
                  <span className="font-display text-2xl tabular-nums">{r.points}</span>
                  <span className="ml-1 text-xs text-chalk/80">{t("season.pts")}</span>
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </AppShell>
  )
}
