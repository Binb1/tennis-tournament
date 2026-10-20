import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ChevronRight } from "lucide-react"

import { AppShell, Box, ErrorBox, Loading, PageTitle, ResultTag, Tag } from "@/components/court/AppShell"
import { Flag } from "@/components/court/PlayerLabel"
import { CategoryBadge, StakeTag } from "@/components/court/PointsStake"
import { MiniCourt } from "@/components/court/SurfacePicker"
import { BallConfetti } from "@/components/pixel/Animations"
import { useAuth } from "@/lib/auth"
import { roundName, t, tr } from "@/lib/i18n"
import { CATEGORIES, categoryOf, roundsOfDraw } from "@/lib/scoring"
import { Once } from "@/lib/seen"
import { isThemeId, themeLabel } from "@/lib/theme"
import {
  fetchLastPicks,
  fetchWinners,
  formatDate,
  groupTournaments,
  hasDraw,
  statusLabel,
  supabase,
  type EntryStatus,
  type LastPick,
  type Round,
  type Tournament,
  type WithDraw,
} from "@/lib/supabase"
import { formatLeft, useNow } from "@/lib/time"
import { cn } from "@/lib/utils"

type Row = WithDraw & { entries: { count: number }[] }

export default function Tournaments() {
  const { session } = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [mine, setMine] = useState<Record<string, EntryStatus>>({})
  const [winners, setWinners] = useState<Set<string>>(new Set())
  // Open round per tournament (first round not locked yet) and my latest pick per entry.
  const [openRound, setOpenRound] = useState<Record<string, Round>>({})
  const [lastPicks, setLastPicks] = useState<Record<string, LastPick>>({})
  const now = useNow(30_000)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    setError(null)
    Promise.all([
      supabase.from("tournaments").select("*, entries(count), players(count)").order("starts_at", { ascending: false }),
      supabase.from("entry_status").select("*").eq("user_id", session!.user.id),
    ]).then(async ([t, e]) => {
      if (!active) return
      if (t.error || e.error) return setError((t.error ?? e.error)!.message)
      const rows = t.data as Row[]
      const mine = e.data as EntryStatus[]
      const finished = new Set(rows.filter((x) => x.status === "finished").map((x) => x.id))
      const playing = rows.filter((x) => x.status === "registration" || x.status === "live").map((x) => x.id)
      try {
        const [w, r, p] = await Promise.all([
          fetchWinners(mine.filter((s) => finished.has(s.tournament_id)).map((s) => s.tournament_id)),
          supabase.from("rounds").select("*").in("tournament_id", playing).gt("locks_at", new Date().toISOString()).order("idx"),
          fetchLastPicks(mine),
        ])
        if (r.error) throw new Error(r.error.message)
        if (!active) return
        setWinners(w)
        const open: Record<string, Round> = {}
        for (const round of r.data as Round[]) open[round.tournament_id] ??= round
        setOpenRound(open)
        setLastPicks(p)
      } catch (err) {
        if (active) setError((err as Error).message)
        return
      }
      setRows(rows)
      setMine(Object.fromEntries(mine.map((s) => [s.tournament_id, s])))
    })
    return () => {
      active = false
    }
  }, [session, reload])

  return (
    <AppShell>
      <PageTitle eyebrow={t("tournaments.eyebrow", { year: new Date().getFullYear() })}>{t("tournaments.title")}</PageTitle>
      {error && <ErrorBox message={error} onRetry={() => setReload((n) => n + 1)} />}
      {!rows && !error && <Loading />}
      {rows && <ThisWeek rows={rows} now={now} />}
      {rows && <ToDo rows={rows} mine={mine} openRound={openRound} lastPicks={lastPicks} now={now} />}
      {rows && rows.length === 0 && <p className="py-8 text-center text-chalk/85">{t("tournaments.empty")}</p>}
      {rows &&
        groupTournaments(rows).map(({ title, list }) => {
          return (
            <section key={title} className="mb-8">
              <h2 className="micro-label mb-3">{title}</h2>
              <div className="space-y-3">
                {list.map((x) => (
                  <TournamentCard
                    key={x.id}
                    tour={x}
                    me={mine[x.id]}
                    winners={winners}
                    round={openRound[x.id]}
                    last={mine[x.id] ? lastPicks[mine[x.id].entry_id] : undefined}
                    now={now}
                  />
                ))}
              </div>
            </section>
          )
        })}
    </AppShell>
  )
}

/**
 * The category ladder, lit up for what's played this week (live, or starting within 7 days): count and names per
 * category, the others dimmed. Shows at a glance which categories are on and what each is worth.
 */
function ThisWeek({ rows, now }: { rows: Row[]; now: number }) {
  const week = rows.filter(
    (x) => !x.test && (x.status === "live" || (x.status === "registration" && !!x.starts_at && Date.parse(x.starts_at) - now < 7 * 24 * 3600 * 1000)),
  )
  if (!week.length) return null
  return (
    <section className="mb-8">
      <h2 className="micro-label mb-3">{t("tournaments.thisWeek")}</h2>
      <ul className="grid grid-cols-2 gap-1.5 min-[520px]:grid-cols-4">
        {CATEGORIES.map((c) => {
          const list = week.filter((x) => categoryOf(x.category).id === c.id)
          return (
            <li
              key={c.id}
              title={list.map((x) => x.name).join(", ") || undefined}
              className={cn("border-2 border-chalk/90 border-l-[6px] px-2.5 py-2", !list.length && "opacity-45")}
              style={{ borderLeftColor: c.color }}
            >
              <span className="flex items-center justify-between gap-2">
                <CategoryBadge category={c.id} />
                <span className="text-xs font-bold">×{c.mult}</span>
              </span>
              <span className="mt-1 block truncate text-xs">
                {list.length ? t("tournaments.weekCount", { count: list.length }) : t("tournaments.weekNone")}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Picks are open during registration (round 1 only) and live. */
const pickable = (t: Tournament, round?: Round) => (round && (t.status === "live" || round.idx === 1) ? round : undefined)

/**
 * What needs doing now, soonest lock first: rounds I still have to pick for.
 * With nothing to pick, the open tournaments I haven't joined.
 */
function ToDo({
  rows,
  mine,
  openRound,
  lastPicks,
  now,
}: {
  rows: Row[]
  mine: Record<string, EntryStatus>
  openRound: Record<string, Round>
  lastPicks: Record<string, LastPick>
  now: number
}) {
  const picks = rows
    .flatMap((tour) => {
      const me = mine[tour.id]
      const round = pickable(tour, openRound[tour.id])
      if (!me?.alive || !round || lastPicks[me.entry_id]?.picked.includes(round.id)) return []
      const ms = new Date(round.locks_at).getTime() - now
      return ms > 0 ? [{ tour, round, ms }] : []
    })
    .sort((a, b) => a.ms - b.ms)
  const joinable = picks.length ? [] : rows.filter((x) => x.status === "registration" && hasDraw(x) && !mine[x.id])
  if (!picks.length && !joinable.length) return null

  return (
    <section className="mb-8 border-l-4 border-ball bg-ink/70">
      <h2 className="micro-label px-4 pt-3">{picks.length ? t("tournaments.toDo") : t("tournaments.joinOpen")}</h2>
      <ul>
        {picks.map(({ tour, round, ms }) => (
          <li key={tour.id}>
            <Link to={`/tournois/${tour.id}`} className="flex min-h-11 items-center gap-3 px-4 py-2.5 hover:bg-chalk/10">
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{t("tournaments.pickPlayer", { round: roundName(round.name) })}</span>
                <span className="block text-sm">
                  <Flag code={tour.country} className="mr-1" />
                  {tr("tournaments.locksIn", { name: tour.name, left: <span className="tabular-nums">{formatLeft(ms, false)}</span> })}
                </span>
              </span>
              <ChevronRight className="size-5 shrink-0" />
            </Link>
          </li>
        ))}
        {joinable.map((tour) => (
          <li key={tour.id}>
            <Link to={`/tournois/${tour.id}`} className="flex min-h-11 items-center gap-3 px-4 py-2.5 hover:bg-chalk/10">
              <span className="min-w-0 flex-1 font-bold">
                {tr("tournaments.join", {
                  name: (
                    <>
                      <Flag code={tour.country} className="mx-0.5" /> {tour.name}
                    </>
                  ),
                })}
              </span>
              <ChevronRight className="size-5 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function TournamentCard({
  tour,
  me,
  winners,
  round,
  last,
  now,
}: {
  tour: Row
  me?: EntryStatus
  winners: Set<string>
  round?: Round
  last?: LastPick
  now: number
}) {
  const count = tour.entries[0]?.count ?? 0
  const open = pickable(tour, round)
  const ms = open ? new Date(open.locks_at).getTime() - now : 0
  return (
    <Link to={`/tournois/${tour.id}`} className="block">
      <Box
        className={cn("flex items-center gap-3 px-4 py-4 transition-colors hover:bg-chalk/10", !tour.test && "border-l-[6px]")}
        style={tour.test ? undefined : { borderLeftColor: categoryOf(tour.category).color }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="neutral">{statusLabel(tour.status, hasDraw(tour))}</Tag>
            {tour.test && <Tag tone="alert">{t("tournaments.test")}</Tag>}
            {!tour.test && <StakeTag category={tour.category} rounds={roundsOfDraw(tour.draw_size)} />}
            {me && <MyState status={tour.status} me={me} winner={winners.has(me.entry_id)} />}
          </div>
          <h3 className="mt-2 font-display text-2xl leading-tight [overflow-wrap:anywhere]">
            {isThemeId(tour.theme) && (
              <span title={t("tournaments.style", { name: themeLabel(tour.theme) })} className="mr-2 inline-block align-[0.1em]">
                <MiniCourt id={tour.theme} small className="outline outline-1 outline-chalk/50" />
              </span>
            )}
            <Flag code={tour.country} className="mr-2" />
            {tour.name}
          </h3>
          <p className="mt-1 text-sm text-chalk/85">
            {tour.tour} · {formatDate(tour.starts_at)} · {t("tournaments.joinedCount", { count })}
          </p>
          {open && ms > 0 && (
            <p className="mt-1 text-sm font-bold">
              {tr("tournaments.locksIn", { name: roundName(open.name), left: <span className="tabular-nums">{formatLeft(ms, false)}</span> })}
            </p>
          )}
          {!me && tour.status === "live" && tour.late_join && open && ms > 0 && (
            <p className="mt-1 text-sm">{t("tournaments.lateJoinOpen")}</p>
          )}
          {me && <MyPickLine me={me} last={last} open={open && ms > 0 ? open : undefined} live={tour.status === "live"} />}
        </div>
        <ChevronRight className="size-5 shrink-0 text-chalk/80" />
      </Box>
    </Link>
  )
}

/**
 * My pick on a card: the open round's pick (or a "no pick yet" alert), else my latest pick.
 * When I'm out without a pick in the fatal round, say so.
 */
export function MyPickLine({ me, last, open, live = false }: { me: EntryStatus; last?: LastPick; open?: Round; live?: boolean }) {
  if (me.alive && open && !last?.picked.includes(open.id)) {
    return (
      <p role="status" className="mt-3 border-l-4 border-ball bg-ink/70 px-3 py-2 text-sm font-medium">
        {t("tournaments.noPickYet", { round: roundName(open.name) })}
      </p>
    )
  }
  if (!me.alive && last?.roundIdx !== me.eliminated_round) {
    return (
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-l-4 border-chalk bg-brick/40 px-3 py-2 text-sm">
        <span>{t("tournaments.noPickAtLock")}</span>
        <ResultTag result="lost" />
      </p>
    )
  }
  if (!last) return null
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-l-4 border-chalk bg-brick/40 px-3 py-2 text-sm">
      <span className="text-chalk/90">{t("tournaments.yourPick", { round: roundName(last.roundName) })}</span>
      <strong className="inline-flex items-center gap-1.5 font-bold">
        <Flag code={last.country} />
        {last.player}
      </strong>
      <span className="relative inline-flex">
        <ResultTag result={last.result} />
        {/* A live win, first time it shows on this device. */}
        {live && last.result === "won" && (
          <Once id={`won:card:${me.entry_id}:${last.roundId}`}>
            <BallConfetti className="absolute -top-8 left-1/2 w-24 -translate-x-1/2" />
          </Once>
        )}
      </span>
    </p>
  )
}

/** `winner`: see fetchWinners (alive after the final). */
export function MyState({ status, me, winner }: { status: Tournament["status"]; me: EntryStatus; winner: boolean }) {
  if (status === "registration") return <Tag tone="alive">{t("tournaments.stateJoined")}</Tag>
  if (status === "finished" && winner) return <Tag tone="win">{t("tournaments.stateWinner")}</Tag>
  if (!me.alive) return <Tag tone="out">{t("tournaments.stateOut")}</Tag>
  return <Tag tone="alive">{t("tournaments.stateAlive")}</Tag>
}
