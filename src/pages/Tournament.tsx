import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react"
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { ArrowLeft, Check, ChevronRight, Lock, LockOpen, Minus, X } from "lucide-react"

import { AppShell, Box, ChalkButton, ErrorBox, FindMe, LineButton, Loading, ME_ROW, PageTitle, ResultTag, SearchInput, Tag } from "@/components/court/AppShell"
import { Bracket } from "@/components/court/Bracket"
import { StakeCard } from "@/components/court/PointsStake"
import { Flag, MatchLine, PlayerName } from "@/components/court/PlayerLabel"
import { SocialIcons } from "@/components/court/Socials"
import { BallBoyRun, PixelNetFault, PixelWin, ShotClock } from "@/components/pixel/Animations"
import { useAuth } from "@/lib/auth"
import { dbError, locale, roundName, t, tr, type MsgKey } from "@/lib/i18n"
import { Once } from "@/lib/seen"
import { bonusPoints, roundPoints } from "@/lib/scoring"
import { useThemeOverride } from "@/lib/theme"
import { formatLeft, useNow } from "@/lib/time"
import { cn } from "@/lib/utils"
import {
  displayName,
  fetchAll,
  canJoin,
  formatDate,
  statusLabel,
  supabase,
  type ChampionPick,
  type EntryStatus,
  type Match,
  type Pick,
  type Waiver,
  type Player,
  type PlayerResult,
  type Round,
  type Tournament,
} from "@/lib/supabase"

type EntryRow = {
  id: string
  user_id: string | null
  profiles: { username: string; deleted_at: string | null; x_handle?: string | null; instagram_handle?: string | null } | null
}
type Data = {
  t: Tournament
  rounds: Round[]
  players: Player[]
  results: PlayerResult[]
  entries: EntryRow[]
  statuses: EntryStatus[]
  picks: Pick[]
  waivers: Waiver[]
  matches: Match[]
  champions: ChampionPick[]
  /** My season points in this tournament so far (0 when not joined). */
  myPoints: number
}
type ChipState = "won" | "lost" | "pending" | "missing" | "waived" | "open"
type TrailStep = { round: Round; state: ChipState; player?: Player }

async function load(id: string, uid: string | undefined): Promise<Data> {
  const { data: tour, error } = await supabase.from("tournaments").select("*").eq("id", id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!tour) throw new Error(t("tournament.notFound"))
  const r = await supabase.from("rounds").select("*").eq("tournament_id", id).order("idx")
  if (r.error) throw new Error(r.error.message)
  const rounds = r.data as Round[]
  const roundIds = rounds.map((x) => x.id)
  const [players, results, entries, statuses, picks, waivers, matches, champions, myPoints] = await Promise.all([
    fetchAll<Player>((a, b) => supabase.from("players").select("id, name, seed, country, ranking").eq("tournament_id", id).order("name").range(a, b)),
    fetchAll<PlayerResult>((a, b) =>
      supabase.from("player_results").select("player_id, round_id, result").in("round_id", roundIds).order("player_id").order("round_id").range(a, b),
    ),
    fetchAll<EntryRow>((a, b) =>
      supabase.from("entries").select("id, user_id, profiles(username, deleted_at, x_handle, instagram_handle)").eq("tournament_id", id).order("joined_at").order("id").range(a, b),
    ),
    fetchAll<EntryStatus>((a, b) => supabase.from("entry_status").select("*").eq("tournament_id", id).order("entry_id").range(a, b)),
    fetchAll<Pick>((a, b) =>
      supabase.from("picks").select("entry_id, round_id, player_id").in("round_id", roundIds).order("entry_id").order("round_id").range(a, b),
    ),
    fetchAll<Waiver>((a, b) => supabase.from("pick_waivers").select("entry_id, round_id").in("round_id", roundIds).order("entry_id").order("round_id").range(a, b)),
    fetchAll<Match>((a, b) => supabase.from("matches").select("*").eq("tournament_id", id).order("id").range(a, b)),
    fetchAll<ChampionPick>((a, b) =>
      supabase.from("champion_picks").select("entry_id, player_id, entries!inner(tournament_id)").eq("entries.tournament_id", id).order("entry_id").range(a, b),
    ),
    // My season points here so far (season_entry_points: counts from the last reset; no row = nothing counted yet).
    uid
      ? supabase.from("season_entry_points").select("points").eq("tournament_id", id).eq("user_id", uid).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (myPoints.error) throw new Error(myPoints.error.message)
  return {
    t: tour as Tournament,
    rounds,
    players,
    results,
    entries,
    statuses,
    picks,
    waivers,
    matches,
    champions,
    myPoints: (myPoints.data as { points: number } | null)?.points ?? 0,
  }
}

/** Keyed by id: going from one tournament to another (back/forward) starts from a clean state. */
export default function TournamentPage() {
  const { id = "" } = useParams()
  return <TournamentView key={id} id={id} />
}

function TournamentView({ id }: { id: string }) {
  const { session } = useAuth()
  const uid = session?.user.id
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  // "Remplir tous les tours" lives in the URL, so the phone's back button closes it.
  const [params, setParams] = useSearchParams()
  const planning = params.get("remplir") === "1"
  // The tab is in the URL too, so a link (or a refresh) lands on it.
  const tab = TAB_OF[params.get("onglet") ?? ""] ?? "pick"
  const setTab = (v: Tab) => setParams(v === "pick" ? {} : { onglet: TAB_PARAM[v] }, { replace: true })
  const navigate = useNavigate()
  const location = useLocation()

  const reload = useCallback(() => {
    setError(null)
    return load(id, uid)
      .then((d) => {
        setData(d)
        setNow(Date.now())
      })
      .catch((e: Error) => setError(e.message))
  }, [id, uid])

  useEffect(() => {
    reload()
  }, [reload])

  // Coarse clock so the current round flips when a lock passes.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const d = useMemo(() => (data ? derive(data, uid, now) : null), [data, uid, now])

  // Flip exactly at the lock too, so the picker closes when the countdown hits zero (not up to 30 s later).
  const lockAt = d?.currentRound ? new Date(d.currentRound.locks_at).getTime() : null
  useEffect(() => {
    if (lockAt == null) return
    const ms = lockAt - Date.now() + 50
    if (ms > 2 ** 31 - 1) return // setTimeout overflow: the 30 s clock covers it
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, ms))
    return () => clearTimeout(timer)
  }, [lockAt])
  useThemeOverride(data?.t.theme)

  // A lock just passed: refetch so others' picks of that round and eliminations show up.
  const lastRound = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (!d) return
    const cur = d.currentRound?.id ?? null
    if (lastRound.current !== undefined && lastRound.current !== cur) reload()
    lastRound.current = cur
  }, [d, reload])

  async function join() {
    setJoining(true)
    setJoinError(null)
    const { error } = await supabase.rpc("join_tournament", { p_tournament_id: id })
    if (error) setJoinError(dbError(error.message))
    else await reload()
    setJoining(false)
  }

  if (!data || !d) {
    return (
      <AppShell>
        <BackLink />
        {error ? <ErrorBox message={error} onRetry={reload} /> : <Loading />}
      </AppShell>
    )
  }

  const openPlanner = () => {
    setParams({ remplir: "1" })
    window.scrollTo(0, 0)
  }
  // Opened from the tab: go back to it. Landed straight on the planner URL: drop the param.
  const closePlanner = () => (location.key !== "default" ? navigate(-1) : setParams({}, { replace: true }))

  if (planning && d.myEntry && (d.myStatus?.alive ?? true)) {
    return (
      <AppShell wide>
        <Planner data={data} d={d} onChanged={reload} onClose={closePlanner} />
      </AppShell>
    )
  }

  const tn = data.t
  return (
    <AppShell>
      <BackLink />
      <PageTitle eyebrow={`${statusLabel(tn.status, data.players.length > 0)} · ${tn.tour}`}>
        <Flag code={tn.country} className="mr-3 align-[0.06em]" />
        {tn.name}
      </PageTitle>
      <p className="-mt-2 mb-5 text-sm text-chalk/85">
        {formatDate(tn.starts_at)} · {t("tournament.entries", { count: data.entries.length })}
      </p>

      {!tn.test && data.rounds.length > 0 && (
        <StakeCard
          category={tn.category}
          rounds={data.rounds}
          scored={d.myEntry && tn.status !== "registration" ? data.myPoints : undefined}
        />
      )}

      {canJoin(tn, data.rounds, now) && !d.myEntry && (
        <div className="mb-6 space-y-3">
          <ChalkButton onClick={join} disabled={joining} className="w-full">
            {joining ? t("tournament.joining") : t("tournament.join")}
          </ChalkButton>
          {tn.status === "live" && d.currentRound && (
            <p className="text-sm text-chalk/85">{t("tournament.lateJoin", { round: roundName(d.currentRound.name) })}</p>
          )}
          {joinError && <ErrorBox message={joinError} />}
        </div>
      )}

      <Tabs value={tab} onChange={setTab} />
      {error && <div className="mt-4"><ErrorBox message={error} onRetry={reload} /></div>}
      <div className="mt-6">
        {tab === "pick" && <MyPick data={data} d={d} onChanged={reload} onPlan={openPlanner} />}
        {tab === "board" && <Leaderboard data={data} d={d} uid={uid} />}
        {tab === "draw" && <Draw data={data} d={d} />}
      </div>
    </AppShell>
  )
}

function BackLink() {
  return (
    <Link to="/tournois" className="mb-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-chalk/90 hover:text-chalk">
      <ArrowLeft className="size-4" /> {t("tournament.back")}
    </Link>
  )
}

/* ------------------------------------------------------------------ */
/* Derived state: everything is computed from picks + results.         */

function derive(data: Data, uid: string | undefined, now: number) {
  const result = new Map(data.results.map((r) => [`${r.player_id}:${r.round_id}`, r.result]))
  const playerById = new Map(data.players.map((p) => [p.id, p]))
  const roundByIdx = new Map(data.rounds.map((r) => [r.idx, r]))
  const statusByEntry = new Map(data.statuses.map((s) => [s.entry_id, s]))
  const idxOf = new Map(data.rounds.map((r) => [r.id, r.idx]))

  const lostRound = new Map<string, number>()
  for (const r of data.results) {
    const idx = idxOf.get(r.round_id)
    if (r.result === "lost" && idx && idx < (lostRound.get(r.player_id) ?? Infinity)) lostRound.set(r.player_id, idx)
  }

  const picksByEntry = new Map<string, Map<string, string>>()
  for (const p of data.picks) {
    if (!picksByEntry.has(p.entry_id)) picksByEntry.set(p.entry_id, new Map())
    picksByEntry.get(p.entry_id)!.set(p.round_id, p.player_id)
  }

  /** Result of a pick: a player who already lost in an earlier round never plays this one, so the pick is lost. */
  const pickResult = (pid: string, r: Round): "won" | "lost" | undefined =>
    result.get(`${pid}:${r.id}`) ?? ((lostRound.get(pid) ?? Infinity) < r.idx ? "lost" : undefined)

  const locked = (r: Round) => new Date(r.locks_at).getTime() <= now
  const waived = new Set(data.waivers.map((w) => `${w.entry_id}:${w.round_id}`))
  /** A locked round without a pick: "repêché" when the admin waived it, else out. */
  const noPick = (entryId: string, r: Round): ChipState => (waived.has(`${entryId}:${r.id}`) ? "waived" : "missing")
  const currentRound = data.rounds.find((r) => !locked(r)) ?? null

  function trail(entryId: string): TrailStep[] {
    const picks = picksByEntry.get(entryId)
    const out = statusByEntry.get(entryId)?.eliminated_round ?? Infinity
    return data.rounds
      .filter((r) => r.idx <= out && (locked(r) || r.id === currentRound?.id))
      .map((round): TrailStep => {
        const pid = picks?.get(round.id)
        const player = pid ? playerById.get(pid) : undefined
        if (!pid) return { round, state: locked(round) ? noPick(entryId, round) : "open" }
        const res = pickResult(pid, round)
        return { round, player, state: res === "won" ? "won" : res === "lost" ? "lost" : "pending" }
      })
  }

  const livePicks = data.picks.filter((p) => {
    const out = statusByEntry.get(p.entry_id)?.eliminated_round
    return out == null || (idxOf.get(p.round_id) ?? 0) <= out
  })

  const myEntry = data.entries.find((e) => e.user_id && e.user_id === uid) ?? null
  const myStatus = myEntry ? statusByEntry.get(myEntry.id) ?? null : null
  const myPicks = myEntry ? picksByEntry.get(myEntry.id) ?? new Map<string, string>() : new Map<string, string>()

  // A player's match in a round: "<round id>:<player id>" -> match.
  const matchOf = new Map<string, Match>()
  for (const m of data.matches) {
    if (m.player1_id) matchOf.set(`${m.round_id}:${m.player1_id}`, m)
    if (m.player2_id) matchOf.set(`${m.round_id}:${m.player2_id}`, m)
  }

  // Each player's first bracket slot (round idx, position). Slot p of round k feeds slot ceil(p/2) of round k+1.
  const slotOf = new Map<string, { k: number; p: number }>()
  for (const m of data.matches) {
    const k = idxOf.get(m.round_id)
    if (!k || !m.position) continue
    for (const pid of [m.player1_id, m.player2_id]) {
      if (pid && k < (slotOf.get(pid)?.k ?? Infinity)) slotOf.set(pid, { k, p: m.position })
    }
  }
  // Byes: the draw lists them as a done match scored "bye", the other side empty. A player with a bye in a round, or
  // whose first real match is in a later round, has nothing to win there (make_pick refuses him, migration 0016).
  const byes = new Set<string>()
  const firstMatch = new Map<string, number>()
  for (const m of data.matches) {
    const k = idxOf.get(m.round_id)
    if (!k) continue
    const bye = m.score?.toLowerCase() === "bye"
    for (const pid of [m.player1_id, m.player2_id]) {
      if (!pid) continue
      if (bye) byes.add(`${m.round_id}:${pid}`)
      else if (k < (firstMatch.get(pid) ?? Infinity)) firstMatch.set(pid, k)
    }
  }
  const exempt = (pid: string, r: Round) => byes.has(`${r.id}:${pid}`) || (firstMatch.get(pid) ?? 0) > r.idx
  const lastIdx = Math.max(0, ...data.rounds.map((r) => r.idx))
  /** Season points for winning a round (lib/scoring.ts). */
  const pointsOf = (r: Round) => roundPoints(data.t.category, r.idx, lastIdx)

  // Champion prediction: open until round 1 locks; the title goes to the winner of the last round.
  const firstRound = roundByIdx.get(1)
  const championOpen =
    (data.t.status === "registration" || data.t.status === "live") && !!firstRound && !locked(firstRound)
  const finalRound = roundByIdx.get(lastIdx)
  const champion = finalRound ? data.results.find((r) => r.round_id === finalRound.id && r.result === "won")?.player_id : undefined
  const championOf = new Map(data.champions.map((c) => [c.entry_id, c.player_id]))
  /** Result of a prediction: right once the final is won, wrong as soon as the player loses. */
  const championResult = (pid: string): "won" | "lost" | undefined =>
    champion ? (champion === pid ? "won" : "lost") : lostRound.has(pid) ? "lost" : undefined
  /** Round idx in which two players would face each other, or null when unknown. */
  const meetRound = (a: string, b: string) => {
    const sa = slotOf.get(a)
    const sb = slotOf.get(b)
    if (!sa || !sb) return null
    for (let k = Math.max(sa.k, sb.k); k <= lastIdx; k++) {
      if (Math.ceil(sa.p / 2 ** (k - sa.k)) === Math.ceil(sb.p / 2 ** (k - sb.k))) return k
    }
    return null
  }

  /** My path in the bracket: a player picked for round k wins each of his slots up to k. "<round id>:<pos>" -> player. */
  const myPath = new Map<string, string>()
  for (const [rid, pid] of myPicks) {
    const sp = slotOf.get(pid)
    const k = idxOf.get(rid)
    if (!sp || !k) continue
    for (let j = sp.k; j <= k; j++) {
      const r = roundByIdx.get(j)
      if (r) myPath.set(`${r.id}:${Math.ceil(sp.p / 2 ** (j - sp.k))}`, pid)
    }
  }

  return { result, playerById, picksByEntry, livePicks, exempt, meetRound, myPath, roundByIdx, statusByEntry, lostRound, pickResult, currentRound, locked, noPick, trail, myEntry, myStatus, myPicks, matchOf, pointsOf, championOpen, championOf, championResult }
}
type Derived = ReturnType<typeof derive>

/* ------------------------------------------------------------------ */

type Tab = "pick" | "board" | "draw"
const TAB_PARAM: Record<Tab, string> = { pick: "choix", board: "classement", draw: "tableau" }
const TAB_OF: Record<string, Tab> = { choix: "pick", classement: "board", tableau: "draw" }

function Tabs({ value, onChange }: { value: Tab; onChange: (v: Tab) => void }) {
  const tabs = [
    ["pick", t("tournament.tabPick"), t("tournament.tabPickHint")],
    ["board", t("tournament.tabBoard"), t("tournament.tabBoardHint")],
    ["draw", t("tournament.tabDraw"), t("tournament.tabDrawHint")],
  ] as const
  // Three court boxes separated by chalk lines; the small line says whose it is (this game, or the real tournament).
  return (
    <div role="tablist" className="grid grid-cols-3 border-2 border-chalk/90">
      {tabs.map(([key, label, hint], i) => (
        <button
          key={key}
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "min-h-11 px-2 py-2 transition-colors",
            i > 0 && "border-l-2 border-chalk/90",
            value === key ? "bg-chalk text-ink" : "hover:bg-chalk/10",
          )}
        >
          <span className="block text-[12px] font-bold tracking-[0.14em] uppercase [font-stretch:85%]">{label}</span>
          <span className={cn("block text-[11px] leading-tight", value === key ? "text-ink/70" : "text-chalk/75")}>{hint}</span>
        </button>
      ))}
    </div>
  )
}

const CHIP_STYLE: Record<ChipState, string> = {
  won: "bg-canvas text-chalk border-canvas",
  lost: "bg-ink/80 text-chalk-dim border-ink/80 line-through",
  pending: "border-chalk text-chalk",
  missing: "border-dashed border-chalk/70 text-chalk/80",
  waived: "border-dashed border-chalk text-chalk",
  open: "border-chalk/40 text-chalk/70",
}
const CHIP_LABEL: Record<ChipState, MsgKey> = {
  won: "tournament.chipWon",
  lost: "tournament.chipLost",
  pending: "tournament.chipPending",
  missing: "tournament.chipMissing",
  waived: "tournament.chipWaived",
  open: "tournament.chipOpen",
}

function Chip({ step, withPlayer = false }: { step: TrailStep; withPlayer?: boolean }) {
  return (
    <span
      title={`${roundName(step.round.name)} · ${step.player?.name ?? t(CHIP_LABEL[step.state])}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[2px] border-2 px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap [font-stretch:85%]",
        CHIP_STYLE[step.state],
      )}
    >
      <span className="tracking-[0.08em] uppercase">{roundName(step.round.name)}</span>
      {withPlayer && (
        <span className="inline-flex items-center gap-1 font-medium normal-case">
          <Flag code={step.player?.country} />
          {step.player?.name ?? t(CHIP_LABEL[step.state])}
        </span>
      )}
      <span className="sr-only">{t(CHIP_LABEL[step.state])}</span>
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Mon choix                                                           */

/** Rounds still open, when picks are: registration and live, every round not locked yet. */
const openRoundsOf = (data: Data, d: Derived) =>
  data.t.status === "live" || data.t.status === "registration" ? data.rounds.filter((r) => !d.locked(r)) : []

function MyPick({ data, d, onChanged, onPlan }: { data: Data; d: Derived; onChanged: () => Promise<void>; onPlan: () => void }) {
  const [roundId, setRoundId] = useState<string | null>(null)
  const [view, setView] = useState<"list" | "tree">("list")
  const gridRef = useRef<HTMLElement>(null)
  const status = data.t.status
  const openRounds = openRoundsOf(data, d)
  // The chosen round, or the current one (also when the chosen round just locked).
  const round = openRounds.find((r) => r.id === roundId) ?? openRounds[0] ?? null

  if (!d.myEntry) {
    return (
      <Empty>
        {data.t.status === "registration"
          ? t("tournament.joinFirst")
          : t("tournament.notJoined")}
      </Empty>
    )
  }

  // History (locked rounds); the open rounds follow it in the run list.
  const trail = d.trail(d.myEntry.id).filter((s) => d.locked(s.round))
  const alive = d.myStatus?.alive ?? true
  const pickedId = round ? d.myPicks.get(round.id) : undefined
  const isCurrent = !!round && round.id === d.currentRound?.id
  const filled = openRounds.filter((r) => d.myPicks.has(r.id)).length
  // The last locked round: the result to wait for, animated once it is in.
  const lockedRounds = data.rounds.filter(d.locked)
  const statusRound = status === "live" ? lockedRounds[lockedRounds.length - 1] : undefined
  const roundLabel = (idx: number) => {
    const name = d.roundByIdx.get(idx)?.name
    return name ? roundName(name) : t("tournament.roundN", { n: idx })
  }
  // Queued players who lost before their round: that pick is a loss unless changed before the lock.
  const stale = openRounds.filter((r) => {
    const pid = d.myPicks.get(r.id)
    return pid && d.lostRound.has(pid)
  })

  // Filling the path from here: after a first pick, go on to the next open round still without one.
  function picked(hadPick: boolean) {
    if (!round || hadPick) return
    const next = openRounds.find((r) => r.idx > round.idx && !d.myPicks.has(r.id))
    if (!next) return
    setRoundId(next.id)
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const FillButton = filled < openRounds.length ? ChalkButton : LineButton

  // Top to bottom: the champion side bet, my run (every round, with where it stands), then the selected round to pick.
  return (
    <div className="space-y-6">
      <ChampionCard data={data} d={d} onChanged={onChanged} />

      {(trail.length > 0 || (alive && round)) && (
        <section ref={gridRef} className="scroll-mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="micro-label">{t("tournament.myPath")}</h2>
            {alive && round && (
              <Segmented
                label={t("tournament.myPicksView")}
                value={view}
                onChange={setView}
                options={[
                  ["list", t("tournament.viewList")],
                  ["tree", t("tournament.viewBracket")],
                ]}
              />
            )}
          </div>
          <RunList
            d={d}
            entryId={d.myEntry.id}
            past={trail}
            open={alive ? openRounds : []}
            selected={round?.id}
            onSelect={setRoundId}
            resultRound={statusRound}
          />
          {alive && openRounds.length > 1 && <p className="text-xs text-chalk/85">{t("tournament.runHint")}</p>}
          {alive && round && view === "tree" && <MyBracket data={data} d={d} round={round} boxClassName="max-h-[70svh]" />}
        </section>
      )}

      {!alive ? (
        <Box className="px-4 py-5">
          <p className="font-display text-2xl">{t("tournament.eliminated")}</p>
          <p className="mt-1 text-chalk/90">
            {t("tournament.eliminatedAt", { round: roundLabel(d.myStatus!.eliminated_round!) })}
          </p>
        </Box>
      ) : !round ? (
        <Empty>{t("tournament.noOpenRound")}</Empty>
      ) : (
        <>
          {/* Main call to action while rounds are missing; once all are filled, just a way back in. */}
          {openRounds.length > 1 && (
            <FillButton onClick={onPlan} className="w-full">
              {t("tournament.fillAll")}
              <span className="ml-2 tabular-nums opacity-75">
                {filled}/{openRounds.length}
              </span>
            </FillButton>
          )}

          <LockBlock round={round} planned={!isCurrent} points={d.pointsOf(round)} />

          {stale.length > 0 && (
            <div role="alert" className="border-l-4 border-ball bg-ink/70 px-4 py-3 text-sm font-medium">
              {t("tournament.stale", { rounds: stale.map((r) => roundName(r.name)).join(", ") })}
            </div>
          )}

          {!pickedId &&
            (isCurrent ? (
              <div role="status" className="border-l-4 border-ball bg-ink/70 px-4 py-3 text-sm font-medium">
                {t("tournament.noPickYet")}
              </div>
            ) : (
              <div role="status" className="border-l-4 border-chalk bg-brick/40 px-4 py-3 text-sm">
                {t("tournament.canPrepare")}
              </div>
            ))}

          <PlayerPicker key={round.id} data={data} d={d} round={round} onChanged={onChanged} onPicked={picked} />
        </>
      )}
    </div>
  )
}

const RUN_ICON = { won: Check, lost: X, pending: Lock, missing: Minus, waived: Check, open: LockOpen } as const

/**
 * My run, one row per round, each saying where it stands: played (won / lost), locked and in play, or open until its
 * lock (tap to pick it below). Rounds after an elimination aren't listed.
 */
function RunList({
  d,
  entryId,
  past,
  open,
  selected,
  onSelect,
  resultRound,
}: {
  d: Derived
  entryId: string
  /** Locked rounds, as in the trail. */
  past: TrailStep[]
  open: Round[]
  selected?: string
  onSelect: (id: string) => void
  /** The last locked round: its result plays the little animation. */
  resultRound?: Round
}) {
  const now = useNow(30_000)
  const rows = [
    ...past.map((s) => ({ round: s.round, state: s.state, pid: s.player?.id })),
    ...open.map((r) => ({ round: r, state: "open" as const, pid: d.myPicks.get(r.id) })),
  ]
  if (rows.length === 0) return null
  return (
    <ol className="border-2 border-chalk/90">
      {rows.map(({ round, state, pid }) => {
        const Icon = RUN_ICON[state]
        const isOpen = state === "open"
        const on = isOpen && round.id === selected
        const out = isOpen && !!pid && d.lostRound.has(pid)
        const status =
          state === "pending"
            ? t("tournament.runInPlay")
            : isOpen
              ? t("tournament.runLocksIn", { left: formatLeft(new Date(round.locks_at).getTime() - now, false) })
              : t(CHIP_LABEL[state])
        const body = (
          <>
            <Icon aria-hidden="true" className={cn("size-4 shrink-0", state === "won" && "text-ball", state === "lost" && "opacity-60")} />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold tracking-[0.08em] uppercase opacity-80 [font-stretch:85%]">
                {roundName(round.name)}
              </span>
              {pid ? (
                <PlayerName p={d.playerById.get(pid)} className={cn("text-sm font-semibold", (state === "lost" || out) && "line-through")} />
              ) : (
                <span className={cn("text-sm", isOpen ? "font-semibold text-ball" : "opacity-80")}>
                  {isOpen ? t("tournament.chipOpen") : "–"}
                </span>
              )}
            </span>
            <span className="shrink-0 text-right text-[11px] font-bold tracking-[0.08em] uppercase [font-stretch:85%]">{status}</span>
            {round.id === resultRound?.id && pid && <ResultMoment id={`${entryId}:${round.id}`} result={d.pickResult(pid, round)} />}
          </>
        )
        const row = "flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left"
        return (
          <li
            key={round.id}
            className={cn(
              "border-t-2 border-chalk/40 first:border-t-0",
              state === "lost" && "text-chalk/70",
              state === "pending" && "bg-brick/40 shadow-[inset_4px_0_0_var(--color-chalk)]",
              on && "bg-chalk text-ink",
            )}
          >
            {isOpen ? (
              <button onClick={() => onSelect(round.id)} aria-pressed={on} className={cn(row, !on && "hover:bg-chalk/10")}>
                {body}
              </button>
            ) : (
              <div className={row}>{body}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * My pick's result, played once per device, small at the end of the pick line: the player jumps for a win, the ball
 * clips the net for a loss.
 */
function ResultMoment({ id, result }: { id: string; result: "won" | "lost" | undefined }) {
  if (!result) return null
  return (
    <Once id={`${result}:pick:${id}`}>
      <span aria-hidden="true" className="-my-2 shrink-0">
        {result === "won" ? <PixelWin className="w-14" /> : <PixelNetFault className="w-16" />}
      </span>
    </Once>
  )
}

/**
 * "Qui gagne le titre ?": one player, changeable until round 1 locks, scored even after elimination
 * (migration 0014). Others' predictions show once round 1 locks (in the leaderboard).
 */
function ChampionCard({ data, d, onChanged }: { data: Data; d: Derived; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pid = d.myEntry ? d.championOf.get(d.myEntry.id) : undefined
  const bonus = bonusPoints(data.t.category)
  const editable = d.championOpen && data.players.length > 0
  if (!pid && !editable) return null

  async function save(playerId: string | null) {
    setSaving(playerId ?? "clear")
    setError(null)
    const { error } = await supabase.rpc("set_champion_pick", { p_tournament_id: data.t.id, p_player_id: playerId })
    if (error) setError(dbError(error.message))
    else {
      await onChanged()
      setOpen(false)
    }
    setSaving(null)
  }

  const needle = q.trim().toLowerCase()
  const list = data.players
    .filter((p) => !d.lostRound.has(p.id) && (!needle || p.name.toLowerCase().includes(needle)))
    .sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999) || a.name.localeCompare(b.name))

  return (
    <section className="space-y-3">
      <Box className="px-4 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="micro-label">{t("tournament.champion")}</span>
          <span className="text-sm font-bold tabular-nums">+{bonus} pts</span>
        </div>
        {pid ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <strong className="font-display text-2xl leading-tight">
              <PlayerName p={d.playerById.get(pid)} />
            </strong>
            {!editable && <ResultTag result={d.championResult(pid)} />}
          </div>
        ) : (
          <p className="mt-2 font-display text-2xl leading-tight">{t("tournament.whoWins")}</p>
        )}
        <p className="mt-1 text-sm text-chalk/85">
          {editable
            ? t("tournament.championEditable")
            : t("tournament.championCounts")}
        </p>
        {editable && (
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <LineButton onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? t("tournament.close") : pid ? t("tournament.change") : t("tournament.pickChampion")}
            </LineButton>
            {pid && (
              <button
                onClick={() => save(null)}
                disabled={!!saving}
                className="min-h-11 text-xs font-medium text-chalk/90 underline underline-offset-2 hover:text-chalk"
              >
                {saving === "clear" ? "…" : t("tournament.remove")}
              </button>
            )}
          </div>
        )}
      </Box>
      {error && <ErrorBox message={error} />}
      {open && editable && (
        <>
          <SearchInput value={q} onChange={setQ} placeholder={t("tournament.searchPlayer")} />
          <ul className="max-h-[50svh] overflow-y-auto border-2 border-chalk/90">
            {list.map((p) => {
              const selected = p.id === pid
              return (
                <li key={p.id} className="border-t-2 border-chalk/50 first:border-t-0">
                  <button
                    disabled={!!saving}
                    onClick={() => save(p.id)}
                    aria-pressed={selected}
                    className={cn(
                      "flex min-h-12 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                      selected ? "bg-chalk text-clay" : "hover:bg-chalk/10",
                    )}
                  >
                    <span className={cn("w-7 shrink-0 text-xs font-bold tabular-nums", !selected && "opacity-70")}>
                      {p.seed ? `[${p.seed}]` : ""}
                    </span>
                    <PlayerName p={p} className={cn("min-w-0 flex-1", selected ? "font-bold" : "font-medium")} />
                    {saving === p.id && <span className="shrink-0 text-xs">…</span>}
                  </button>
                </li>
              )
            })}
            {list.length === 0 && <li className="px-3 py-4 text-sm text-chalk/80">{t("tournament.noPlayer")}</li>}
          </ul>
        </>
      )}
    </section>
  )
}

/** One button per open round: its pick, or "à choisir". */
function RoundGrid({
  rounds,
  d,
  selected,
  onSelect,
}: {
  rounds: Round[]
  d: Derived
  selected: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5 min-[520px]:grid-cols-4">
      {rounds.map((r) => {
        const pid = d.myPicks.get(r.id)
        const on = r.id === selected
        const out = !!pid && d.lostRound.has(pid)
        return (
          <button
            key={r.id}
            onClick={() => onSelect(r.id)}
            aria-pressed={on}
            className={cn(
              "min-h-12 min-w-0 rounded-[2px] border-2 px-2 py-1 text-left",
              on ? "border-chalk bg-chalk text-ink" : pid ? "border-chalk/80 hover:bg-chalk/10" : "border-dashed border-chalk/60 hover:bg-chalk/10",
              out && !on && "border-ball",
            )}
          >
            <span className="block truncate text-[11px] font-bold tracking-[0.08em] uppercase [font-stretch:85%]">{roundName(r.name)}</span>
            <span className={cn("flex items-center gap-1 text-xs", !pid && "opacity-70", out && "line-through")}>
              {pid && <Flag code={d.playerById.get(pid)?.country} />}
              <span className="min-w-0 truncate">{pid ? shortName(d.playerById.get(pid)?.name ?? "") : t("tournament.chipOpen")}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Search + the draw for one open round. Tap a player to pick him (saved right away). */
function PlayerPicker({
  data,
  d,
  round,
  onChanged,
  onPicked,
}: {
  data: Data
  d: Derived
  round: Round
  onChanged: () => Promise<void>
  /** After a successful pick; `hadPick`: the round had a pick before (a change, not a first pick). */
  onPicked?: (hadPick: boolean) => void
}) {
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const pickedId = d.myPicks.get(round.id)
  const roundLabel = (idx: number) => {
    const name = d.roundByIdx.get(idx)?.name
    return name ? roundName(name) : t("tournament.roundN", { n: idx })
  }

  // My picks in the other rounds of my path.
  const others = data.rounds.flatMap((r) => {
    const pid = r.id === round.id ? undefined : d.myPicks.get(r.id)
    return pid ? [{ r, pid }] : []
  })
  // Why a player can't be picked, or null if he can.
  const reason = (p: Player) => {
    const lost = d.lostRound.get(p.id)
    if (lost) return t("tournament.outAt", { round: roundLabel(lost) })
    if (d.exempt(p.id, round)) return t("tournament.byeAt", { round: roundName(round.name) })
    const used = others.find((o) => o.pid === p.id)
    if (used) return t(d.locked(used.r) ? "tournament.usedAt" : "tournament.plannedAt", { round: roundName(used.r.name) })
    // Both must win up to the round they meet in: one of the two picks is a sure loss.
    const clash = others.find((o) => (d.meetRound(p.id, o.pid) ?? Infinity) <= Math.min(round.idx, o.r.idx))
    if (clash) return t("tournament.clashAt", { player: shortName(d.playerById.get(clash.pid)?.name ?? ""), round: roundName(clash.r.name) })
    return null
  }
  const needle = q.trim().toLowerCase()
  const list = data.players
    .filter((p) => !needle || p.name.toLowerCase().includes(needle))
    .map((p) => ({ p, why: reason(p) }))
    .sort((a, b) => Number(!!a.why) - Number(!!b.why) || (a.p.seed ?? 999) - (b.p.seed ?? 999) || a.p.name.localeCompare(b.p.name))

  async function save(fn: "make_pick" | "clear_pick", key: string, args: Record<string, string>) {
    setSaving(key)
    setError(null)
    const { error } = await supabase.rpc(fn, args)
    if (error) setError(dbError(error.message))
    else await onChanged()
    setSaving(null)
    return !error
  }
  async function pick(p: Player) {
    const hadPick = !!pickedId
    if (await save("make_pick", p.id, { p_round_id: round.id, p_player_id: p.id })) onPicked?.(hadPick)
  }

  return (
    <section className="space-y-3">
      {error && <ErrorBox message={error} />}
      <div className="flex items-end justify-between gap-3">
        <h2 className="micro-label">
          {t("tournament.drawPlayers", { round: roundName(round.name), pts: d.pointsOf(round) })}
        </h2>
        {pickedId ? (
          <button
            onClick={() => save("clear_pick", "clear", { p_round_id: round.id })}
            disabled={!!saving}
            className="min-h-11 text-xs font-medium text-chalk/90 underline underline-offset-2 hover:text-chalk"
          >
            {saving === "clear" ? "…" : t("tournament.removePick")}
          </button>
        ) : (
          <span className="text-xs text-chalk/80">{t("tournament.editableUntilLock")}</span>
        )}
      </div>
      <SearchInput value={q} onChange={setQ} placeholder={t("tournament.searchPlayer")} />
      <ul className="border-2 border-chalk/90">
        {list.map(({ p, why }) => {
          const selected = p.id === pickedId
          return (
            <li key={p.id} className="border-t-2 border-chalk/50 first:border-t-0">
              <button
                disabled={!!why || !!saving}
                onClick={() => pick(p)}
                aria-pressed={selected}
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  selected ? "bg-chalk text-clay" : "hover:bg-chalk/10",
                  why && "cursor-not-allowed opacity-55",
                )}
              >
                <span className={cn("w-7 shrink-0 text-xs font-bold tabular-nums", !selected && "opacity-70")}>
                  {p.seed ? `[${p.seed}]` : ""}
                </span>
                <span className="min-w-0 flex-1">
                  <PlayerName
                    p={p}
                    className={cn(selected ? "font-bold" : "font-medium", why && "line-through decoration-1")}
                  />
                  {!why && <MatchLine m={d.matchOf.get(`${round.id}:${p.id}`)} pid={p.id} playerById={d.playerById} />}
                </span>
                {why && <span className="shrink-0 text-xs">{why}</span>}
                {selected && (
                  // Inverted tag on the chalk row: surface colour fill, chalk text.
                  <span className="shrink-0 rounded-[2px] bg-clay px-2 py-0.5 text-[11px] font-bold tracking-[0.12em] whitespace-nowrap text-chalk uppercase [font-stretch:85%]">
                    {t("tournament.myPick")}
                  </span>
                )}
                {saving === p.id && <span className="shrink-0 text-xs">…</span>}
              </button>
            </li>
          )
        })}
        {list.length === 0 && <li className="px-3 py-4 text-sm text-chalk/80">{t("tournament.noPlayer")}</li>}
      </ul>
    </section>
  )
}

/**
 * "Remplir tous les tours": one round per step (pick, then Suivant), the rounds already filled excluded from the next
 * steps. On desktop the draw sits next to it, filled with my path as I pick.
 */
function Planner({ data, d, onChanged, onClose }: { data: Data; d: Derived; onChanged: () => Promise<void>; onClose: () => void }) {
  const openRounds = openRoundsOf(data, d)
  const [roundId, setRoundId] = useState(() => (openRounds.find((r) => !d.myPicks.has(r.id)) ?? openRounds[0])?.id)
  const step = Math.max(0, openRounds.findIndex((r) => r.id === roundId))
  const round = openRounds[step]
  const pickedId = round ? d.myPicks.get(round.id) : undefined
  const filled = openRounds.filter((r) => d.myPicks.has(r.id)).length

  const go = (i: number) => {
    setRoundId(openRounds[i].id)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:items-start lg:gap-8">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="micro-label">
              <Flag code={data.t.country} className="mr-1.5" />
              {data.t.name}
            </span>
            <h1 className="font-display text-3xl leading-tight">{t("tournament.fillMine")}</h1>
          </div>
          <LineButton onClick={onClose} className="shrink-0">
            {t("tournament.close")}
          </LineButton>
        </div>

        {!round ? (
          <Empty>{t("tournament.noOpenRound")}</Empty>
        ) : (
          <>
            <div>
              <div className="flex items-baseline justify-between text-xs font-bold [font-stretch:85%]">
                <span className="tracking-[0.08em] uppercase">
                  {t("tournament.stepOf", { step: step + 1, total: openRounds.length })}
                </span>
                <span className="tabular-nums">
                  {t("tournament.filled", { count: filled, total: openRounds.length })}
                </span>
              </div>
              <span className="mt-1.5 block h-2.5 bg-brick/50">
                <span className="block h-full bg-chalk transition-[width]" style={{ width: `${(filled / openRounds.length) * 100}%` }} />
              </span>
            </div>

            <RoundGrid rounds={openRounds} d={d} selected={round.id} onSelect={(id) => setRoundId(id)} />

            <Box className="px-4 py-4">
              <span className="micro-label">
                {round.id === d.currentRound?.id ? t("tournament.lock") : t("tournament.lockPlanned")} · {formatDate(round.locks_at, true)}
              </span>
              <p className="mt-1 font-display text-2xl leading-tight">{roundName(round.name)}</p>
              <p className="mt-1 text-sm text-chalk/90">
                {pickedId ? (
                  <span className="inline-flex items-center gap-1.5">
                    {tr("tournament.myPickIs", {
                      player: (
                        <strong className="font-bold">
                          <PlayerName p={d.playerById.get(pickedId)} rank={false} />
                        </strong>
                      ),
                    })}
                  </span>
                ) : (
                  t("tournament.chooseWinner")
                )}
              </p>
              {pickedId && d.lostRound.has(pickedId) && (
                <p className="mt-2 border-l-4 border-ball pl-3 text-sm font-medium">{t("tournament.playerOutChange")}</p>
              )}
            </Box>

            <PlayerPicker key={round.id} data={data} d={d} round={round} onChanged={onChanged} />

            {/* Step nav, always at hand under the long player list. */}
            <div className="clay-surface sticky bottom-(--tabbar) z-10 -mx-4 flex gap-2 border-t-2 border-chalk/90 px-4 py-3 lg:mx-0 lg:px-0">
              <LineButton onClick={() => go(step - 1)} disabled={step === 0} className="flex-1">
                {t("tournament.prev")}
              </LineButton>
              {step < openRounds.length - 1 ? (
                <ChalkButton onClick={() => go(step + 1)} className="flex-1">
                  {t("tournament.next")}
                </ChalkButton>
              ) : (
                <ChalkButton onClick={onClose} className="flex-1">
                  {t("tournament.finish")}
                </ChalkButton>
              )}
            </div>
          </>
        )}
      </div>

      {/* Desktop: the whole draw with my path, next to the steps. */}
      <aside className="hidden lg:sticky lg:top-4 lg:block">
        <MyBracket data={data} d={d} round={round} boxClassName="max-h-[calc(100svh-11rem)]" />
      </aside>
    </div>
  )
}

/**
 * My path in the draw: every pick drawn as winning its slots up to its round, the opponents it beats struck through.
 * Keeps the given round's pick in view: centred vertically, scrolled sideways only if hidden.
 */
function MyBracket({ data, d, round, boxClassName }: { data: Data; d: Derived; round?: Round | null; boxClassName?: string }) {
  const from = inPlayFrom(data)
  const drawRef = useRef<HTMLDivElement>(null)
  const pickedId = round ? d.myPicks.get(round.id) : undefined
  const slotKey = round && pickedId ? [...d.myPath].find(([k, pid]) => pid === pickedId && k.startsWith(`${round.id}:`))?.[0] : undefined
  useEffect(() => {
    const box = drawRef.current
    const el = slotKey ? box?.querySelector<HTMLElement>(`[data-slot="${slotKey}"]`) : null
    if (!box || !el) return
    const b = box.getBoundingClientRect()
    const e = el.getBoundingClientRect()
    const left = e.left < b.left ? e.left - b.left : e.right > b.right ? e.right - b.right : 0
    box.scrollTo({
      top: box.scrollTop + e.top - b.top - (b.height - e.height) / 2,
      left: box.scrollLeft + left,
      behavior: "smooth",
    })
  }, [slotKey, from])

  if (data.matches.length === 0) return <Empty>{t("tournament.noMatches")}</Empty>
  return (
    <div className="space-y-3">
      <p className="text-sm text-chalk/90">{t("tournament.myBracketHint")}</p>
      <BracketLegend predicted />
      <div ref={drawRef} className={cn("overflow-auto overscroll-contain border-2 border-chalk/90", boxClassName)}>
        <Bracket
          rounds={data.rounds.slice(from)}
          before={data.rounds[from - 1]}
          matches={data.matches}
          playerById={d.playerById}
          drawSize={Math.max(2, data.t.draw_size / 2 ** from)}
          pickByRound={d.myPicks}
          projected={d.myPath}
          className="overflow-visible border-0"
        />
      </div>
    </div>
  )
}

/**
 * Where a bracket starts: the first round not fully played (the rounds before it are history, in "Mon parcours" and the
 * list view). A finished tournament starts at the quarter-finals.
 */
function inPlayFrom(data: Data) {
  const i = data.rounds.findIndex((r) => {
    const ms = data.matches.filter((m) => m.round_id === r.id)
    return ms.length === 0 || ms.some((m) => m.status !== "done")
  })
  return i >= 0 ? Math.min(i, data.rounds.length - 1) : Math.max(0, data.rounds.length - 3)
}

/** Real results vs my picks: a check is a played match, yellow is mine (with ▸ when it's only my prediction). */
function BracketLegend({ predicted = false }: { predicted?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-chalk/90">
      <span className="inline-flex items-center gap-1">
        <Check className="size-3.5" aria-hidden="true" />
        {t("tournament.legendReal")}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-1 bg-ball" aria-hidden="true" />
        {t("tournament.legendMine")}
      </span>
      {predicted && (
        <span className="inline-flex items-center gap-1">
          <ChevronRight className="size-3.5 text-ball" aria-hidden="true" />
          {t("tournament.legendPredicted")}
        </span>
      )}
    </div>
  )
}

/** Big lock countdown: minutes when far, live seconds under 1 h, plus the local lock time. A later round's lock
 *  follows the order of play, so it is only an estimate until then. */
function LockBlock({ round, planned = false, points }: { round: Round; planned?: boolean; points?: number }) {
  const now = useNow(1000)
  const ms = new Date(round.locks_at).getTime() - now
  // Last hour of the round to play: shot clock (blinks under 10 min) and a ball boy running along the box.
  const hurry = !planned && ms > 0 && ms < 3_600_000
  return (
    <Box className={cn("scoreboard px-4 pt-4", hurry ? "pb-1" : "pb-4")}>
      <span className="micro-label">{t(planned ? "tournament.lockInPlanned" : "tournament.lockIn", { round: roundName(round.name) })}</span>
      {hurry ? (
        <ShotClock ms={ms} className="mt-2" />
      ) : (
        <p className="scoreboard-digits mt-1 font-num text-4xl leading-tight tabular-nums">{formatLeft(ms)}</p>
      )}
      <p className="mt-1 text-sm text-chalk/85">
        {t("tournament.localTime", { date: formatDate(round.locks_at, true) })}
        {planned && t("tournament.plannedNote")}
        {points != null && t("tournament.roundWonPts", { n: points })}
      </p>
      <p className="mt-1 text-xs text-chalk/80">
        {round.idx === 1
          ? t("tournament.lockFirst")
          : t("tournament.lockRound")}
      </p>
      {hurry && <BallBoyRun className="mt-1" />}
    </Box>
  )
}

/* ------------------------------------------------------------------ */
/* Classement                                                          */

function Leaderboard({ data, d, uid }: { data: Data; d: Derived; uid?: string }) {
  const [q, setQ] = useState("")
  const [highlight, setHighlight] = useState<string | null>(null)
  const [view, setView] = useState<"list" | "grid" | "dist" | "stats">("list")

  const rows = data.entries
    .map((e) => {
      const s = d.statusByEntry.get(e.id)
      return {
        e,
        name: displayName(e.profiles),
        alive: s?.alive ?? true,
        survived: s?.rounds_survived ?? 0,
        out: s?.eliminated_round ?? null,
        trail: d.trail(e.id),
      }
    })
    .sort((a, b) => Number(b.alive) - Number(a.alive) || b.survived - a.survived || a.name.localeCompare(b.name, locale()))

  // Competition ranking: equal (alive, rounds survived) share a rank.
  const ranks = rows.map((_, i) => i)
  rows.forEach((r, i) => {
    const prev = rows[i - 1]
    if (prev && prev.alive === r.alive && prev.survived === r.survived) ranks[i] = ranks[i - 1]
  })

  const total = rows.length
  const myIdx = rows.findIndex((r) => !!uid && r.e.user_id === uid)
  const myRank =
    myIdx < 0 ? null : { rank: ranks[myIdx] + 1, tied: ranks.filter((x) => x === ranks[myIdx]).length > 1 }
  const aliveCount = rows.filter((r) => r.alive).length
  const finished = data.t.status === "finished"
  // Won only by surviving the final; nobody alive at the end = no winner.
  const isWinner = (r: (typeof rows)[number]) => finished && r.alive
  const winnerCount = rows.filter(isWinner).length

  const lockedRounds = data.rounds.filter(d.locked)
  const funnel = lockedRounds.map((r) => ({
    r,
    n: data.statuses.filter((s) => s.eliminated_round == null || s.eliminated_round > r.idx).length,
  }))

  const needle = q.trim().toLowerCase()
  const shown = rows
    .map((r, i) => ({ ...r, rank: ranks[i] + 1 }))
    .filter(
      (r) =>
        !needle ||
        r.name.toLowerCase().includes(needle) ||
        r.trail.some((s) => s.player?.name.toLowerCase().includes(needle)),
    )

  if (total === 0) return <Empty>{t("tournament.noEntries")}</Empty>

  return (
    <div className="space-y-6">
      <Box className="px-4 py-4">
        <div className="flex items-baseline justify-between">
          <span className="micro-label">{t("tournament.stillAlive")}</span>
          <span className="font-num text-3xl tabular-nums">
            {aliveCount}
            <span className="text-lg text-chalk/80"> / {total}</span>
          </span>
        </div>
        {funnel.length > 0 && (
          <ol className="mt-4 space-y-1.5 border-t-2 border-chalk/50 pt-4">
            {[{ label: t("tournament.funnelEntries"), n: total }, ...funnel.map((f) => ({ label: roundName(f.r.name), n: f.n }))].map((f) => (
              <li key={f.label} className="flex items-center gap-3 text-xs font-bold [font-stretch:85%]">
                <span className="w-14 shrink-0 tracking-[0.08em] uppercase">{f.label}</span>
                <span className="h-2.5 flex-1 bg-brick/50">
                  <span className="block h-full bg-chalk" style={{ width: `${(f.n / total) * 100}%` }} />
                </span>
                <span className="w-8 shrink-0 text-right tabular-nums">{f.n}</span>
              </li>
            ))}
          </ol>
        )}
      </Box>

      <Segmented
        label={t("tournament.boardView")}
        value={view}
        onChange={setView}
        options={[
          ["list", t("tournament.viewList")],
          ["grid", t("tournament.viewGrid")],
          ["dist", t("tournament.viewDist")],
          ["stats", t("tournament.viewStats")],
        ]}
      />

      {view === "dist" && <Distribution d={d} rounds={lockedRounds} />}

      {view === "stats" && <Stats data={data} d={d} rounds={lockedRounds} myRank={myRank} total={total} />}

      {(view === "list" || view === "grid") && (
        <div className="flex gap-2">
          <div className="flex-1">
            <SearchInput value={q} onChange={setQ} placeholder={t("tournament.searchBoard")} />
          </div>
          {myIdx >= 0 && view === "list" && <FindMe onFind={() => setQ("")} />}
        </div>
      )}

      {view === "grid" && <Grid d={d} rounds={lockedRounds} rows={shown} uid={uid} />}

      {view === "list" && <ul className="border-2 border-chalk/90">
        {shown.map((r) => {
          const on = highlight === r.e.id
          const me = !!uid && r.e.user_id === uid
          return (
            <li key={r.e.id} id={me ? ME_ROW : undefined} className="scroll-mt-24 border-t-2 border-chalk/50 first:border-t-0">
              {/* div role=button: the row holds social links, and <a> can't nest in <button>. */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setHighlight(on ? null : r.e.id)}
                onKeyDown={(ev) => {
                  if (ev.target !== ev.currentTarget || (ev.key !== "Enter" && ev.key !== " ")) return
                  ev.preventDefault()
                  setHighlight(on ? null : r.e.id)
                }}
                aria-expanded={on}
                className={cn(
                  "w-full cursor-pointer px-3 py-3 text-left transition-colors",
                  on ? "bg-brick/75 shadow-[inset_4px_0_0_var(--color-chalk)]" : me ? "bg-brick/35 hover:bg-brick/50" : "hover:bg-chalk/10",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 shrink-0 text-sm font-bold tabular-nums">{r.rank}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="min-w-0 truncate font-medium">
                      {r.name}
                      {me && <span className="ml-1.5 text-xs opacity-75">{t("tournament.me")}</span>}
                    </span>
                    {!r.e.profiles?.deleted_at && <SocialIcons p={r.e.profiles} />}
                  </span>
                  {isWinner(r) ? (
                    <Tag tone="win">{winnerCount > 1 ? t("tournament.coWinner") : t("tournament.winner")}</Tag>
                  ) : r.alive ? (
                    <Tag tone="alive">{t("tournament.alive")}</Tag>
                  ) : (
                    <Tag tone="out">{t("tournament.outAt", { round: roundName(d.roundByIdx.get(r.out!)?.name ?? "") })}</Tag>
                  )}
                </div>
                {r.trail.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1 pl-9">
                    {r.trail.map((s) => (
                      <Chip key={s.round.id} step={s} withPlayer={on} />
                    ))}
                  </div>
                )}
                {on && d.championOf.has(r.e.id) && (
                  <p className="mt-2 flex flex-wrap items-center gap-x-2 pl-9 text-xs">
                    <span className="text-chalk/85">{t("tournament.championColon")}</span>
                    <span className="font-bold">
                      <PlayerName p={d.playerById.get(d.championOf.get(r.e.id)!)} />
                    </span>
                    {!d.championOpen && <ResultTag result={d.championResult(d.championOf.get(r.e.id)!)} />}
                  </p>
                )}
              </div>
            </li>
          )
        })}
        {shown.length === 0 && <li className="px-3 py-4 text-sm text-chalk/80">{t("tournament.noResults")}</li>}
      </ul>}
    </div>
  )
}

/** Chalk-boxed segmented control (same look as the tabs, smaller). */
function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: [T, string][]
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex border-2 border-chalk/90">
      {options.map(([key, text], i) => (
        <button
          key={key}
          role="radio"
          aria-checked={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "min-h-11 flex-1 px-2 text-[11px] font-bold tracking-[0.12em] uppercase transition-colors [font-stretch:85%]",
            i > 0 && "border-l-2 border-chalk/90",
            value === key ? "bg-chalk text-ink" : "hover:bg-chalk/10",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

/** 1 -> "1er" / "1st" / "1.º": the ordinal suffix from the language's ordinal plural rules. */
const ORDINAL: Record<Intl.LDMLPluralRule, MsgKey> = {
  zero: "tournament.ordOther",
  one: "tournament.ordOne",
  two: "tournament.ordTwo",
  few: "tournament.ordFew",
  many: "tournament.ordOther",
  other: "tournament.ordOther",
}
const ordinal = (n: number) => `${n}${t(ORDINAL[new Intl.PluralRules(locale(), { type: "ordinal" }).select(n)])}`

/** "Carlos Alcaraz" -> "Alcaraz". */
const shortName = (name: string) => name.trim().split(/\s+/).pop() ?? name

const CELL_STYLE: Record<ChipState, string> = {
  won: "bg-canvas text-chalk",
  lost: "bg-clay-deep text-chalk-dim line-through",
  pending: "text-chalk",
  missing: "text-chalk/60",
  waived: "text-chalk italic",
  open: "text-chalk/60",
}

/** Users × locked rounds. Sticky name column, horizontal scroll inside the box only. */
function Grid({
  d,
  rounds,
  rows,
  uid,
}: {
  d: Derived
  rounds: Round[]
  rows: { e: EntryRow; name: string; out: number | null }[]
  uid?: string
}) {
  if (rounds.length === 0) return <Empty>{t("tournament.gridEmpty")}</Empty>
  if (rows.length === 0) return <Empty>{t("tournament.noResults")}</Empty>

  return (
    <div className="relative overflow-x-auto overscroll-x-contain border-2 border-chalk/90">
      <table className="w-max min-w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b-2 border-chalk/90">
            <th scope="col" className="sticky left-0 z-10 clay-surface border-r-2 border-chalk/90 px-3 py-2">
              <span className="micro-label">{t("tournament.username")}</span>
            </th>
            {rounds.map((r) => (
              <th
                key={r.id}
                scope="col"
                className="border-l-2 border-chalk/40 px-2 py-2 text-[11px] font-bold tracking-[0.1em] whitespace-nowrap uppercase [font-stretch:85%]"
              >
                {roundName(r.name)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const picks = d.picksByEntry.get(row.e.id)
            const me = !!uid && row.e.user_id === uid
            return (
              <tr key={row.e.id} className="border-t-2 border-chalk/40 first:border-t-0">
                <th
                  scope="row"
                  className={cn(
                    "sticky left-0 z-10 clay-surface max-w-[8.5rem] truncate border-r-2 border-chalk/90 px-3 py-2 font-medium",
                    me && "shadow-[inset_4px_0_0_var(--color-chalk)]",
                  )}
                  title={row.name}
                >
                  {row.name}
                </th>
                {rounds.map((r) => {
                  // After elimination the entry stops picking: leave the cell blank.
                  if (row.out != null && r.idx > row.out) return <td key={r.id} className="border-l-2 border-chalk/40" />
                  const pid = picks?.get(r.id)
                  const player = pid ? d.playerById.get(pid) : undefined
                  const res = pid ? d.pickResult(pid, r) : undefined
                  const state: ChipState = !pid ? d.noPick(row.e.id, r) : res === "won" ? "won" : res === "lost" ? "lost" : "pending"
                  return (
                    <td
                      key={r.id}
                      title={`${roundName(r.name)} · ${player?.name ?? t(CHIP_LABEL[state])}`}
                      className={cn("border-l-2 border-chalk/40 px-2 py-2 whitespace-nowrap", CELL_STYLE[state])}
                    >
                      {player ? (
                        <span className="inline-flex items-center gap-1">
                          <Flag code={player.country} />
                          {shortName(player.name)}
                        </span>
                      ) : state === "waived" ? (
                        t("tournament.chipWaived")
                      ) : (
                        "–"
                      )}
                      <span className="sr-only"> · {t(CHIP_LABEL[state])}</span>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Per locked round: how many entries picked each player. */
function Distribution({ d, rounds }: { d: Derived; rounds: Round[] }) {
  if (rounds.length === 0) return <Empty>{t("tournament.distEmpty")}</Empty>

  return (
    <div className="space-y-4">
      {[...rounds].reverse().map((r) => {
        const counts = new Map<string, number>()
        for (const p of d.livePicks) if (p.round_id === r.id) counts.set(p.player_id, (counts.get(p.player_id) ?? 0) + 1)
        const total = [...counts.values()].reduce((a, b) => a + b, 0)
        const list = [...counts]
          .map(([pid, n]) => ({ p: d.playerById.get(pid), pid, n, lost: d.pickResult(pid, r) === "lost" }))
          .sort((a, b) => b.n - a.n || (a.p?.name ?? "").localeCompare(b.p?.name ?? ""))
        return (
          <Box key={r.id} className="px-4 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-display text-xl leading-tight">{roundName(r.name)}</h3>
              <span className="micro-label">{t("tournament.picksCount", { count: total })}</span>
            </div>
            {list.length === 0 ? (
              <p className="mt-3 border-t-2 border-chalk/50 pt-3 text-sm text-chalk/80">{t("tournament.noPicksRound")}</p>
            ) : (
              <ol className="mt-3 space-y-2 border-t-2 border-chalk/50 pt-3">
                {list.map(({ p, pid, n, lost }) => (
                  <li key={pid} className="text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={cn("min-w-0 flex-1 font-medium", lost && "text-chalk/65 line-through")}>
                        <PlayerName p={p} />
                        {lost && <span className="sr-only">{t("tournament.outSr")}</span>}
                      </span>
                      <span className="shrink-0 text-xs font-bold tabular-nums">
                        {n} · {t("tournament.percent", { n: Math.round((n / total) * 100) })}
                      </span>
                    </div>
                    <span className="mt-1 block h-2.5 bg-brick/50">
                      <span
                        className={cn("block h-full", lost ? "bg-chalk/40" : "bg-chalk")}
                        style={{ width: `${(n / total) * 100}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Box>
        )
      })}
    </div>
  )
}

/** Fun facts over locked rounds, all computed from picks + results. */
function Stats({
  data,
  d,
  rounds,
  myRank,
  total,
}: {
  data: Data
  d: Derived
  rounds: Round[]
  myRank: { rank: number; tied: boolean } | null
  total: number
}) {
  if (rounds.length === 0) return <Empty>{t("tournament.statsEmpty")}</Empty>

  const nameOf = new Map(data.entries.map((e) => [e.id, displayName(e.profiles)]))
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0)

  // Every (round, player) that was picked, with who picked him and his result.
  const picked = rounds.flatMap((r) => {
    const byPlayer = new Map<string, string[]>()
    for (const p of d.livePicks) if (p.round_id === r.id) byPlayer.set(p.player_id, [...(byPlayer.get(p.player_id) ?? []), p.entry_id])
    return [...byPlayer].map(([pid, entries]) => ({ r, pid, entries, res: d.pickResult(pid, r) ?? null }))
  })
  const bold = picked
    .filter((x) => x.res === "won")
    .sort((a, b) => a.entries.length - b.entries.length || b.r.idx - a.r.idx)[0]
  const upset = picked
    .filter((x) => x.res === "lost")
    .sort((a, b) => b.entries.length - a.entries.length || b.r.idx - a.r.idx)[0]
  const player = (pid: string) => d.playerById.get(pid)?.name ?? "?"

  const perRound = rounds.map((r) => {
    const list = picked.filter((x) => x.r.id === r.id)
    const n = list.reduce((sum, x) => sum + x.entries.length, 0)
    const top = [...list].sort((a, b) => b.entries.length - a.entries.length)[0]
    const entering = data.statuses.filter((s) => s.eliminated_round == null || s.eliminated_round >= r.idx).length
    const survived = data.statuses.filter((s) => s.eliminated_round == null || s.eliminated_round > r.idx).length
    const pending = list.some((x) => !x.res)
    return { r, n, top, entering, survived, pending }
  })

  return (
    <div className="space-y-4">
      {myRank && (
        <Box className="px-4 py-4">
          <span className="micro-label">{t("tournament.myRanking")}</span>
          <p className="mt-1 font-display text-3xl leading-tight">
            {t("tournament.youAre", { rank: ordinal(myRank.rank) })}
            {myRank.tied && t("tournament.tied")}{" "}
            <span className="text-lg text-chalk/85">{t("tournament.outOf", { total })}</span>
          </p>
        </Box>
      )}

      <Box className="px-4 py-4">
        <span className="micro-label">{t("tournament.boldest")}</span>
        {bold ? (
          <>
            <p className="mt-1 font-display text-2xl leading-tight">{player(bold.pid)}</p>
            <p className="mt-1 text-sm text-chalk/90">
              {t("tournament.boldLine", {
                round: roundName(bold.r.name),
                count: bold.entries.length,
                names: bold.entries.map((id) => nameOf.get(id)).join(", "),
              })}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-chalk/85">{t("tournament.noBold")}</p>
        )}
      </Box>

      <Box className="px-4 py-4">
        <span className="micro-label">{t("tournament.upset")}</span>
        {upset ? (
          <>
            <p className="mt-1 font-display text-2xl leading-tight">{player(upset.pid)}</p>
            <p className="mt-1 text-sm text-chalk/90">
              {t("tournament.upsetLine", { round: roundName(upset.r.name), count: upset.entries.length })}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-chalk/85">{t("tournament.noUpset")}</p>
        )}
      </Box>

      <Box className="px-4 py-4">
        <span className="micro-label">{t("tournament.roundByRound")}</span>
        <ol className="mt-3 space-y-4 border-t-2 border-chalk/50 pt-3">
          {perRound.map(({ r, n, top, entering, survived, pending }) => (
            <li key={r.id} className="text-sm">
              <h3 className="font-display text-xl leading-tight">{roundName(r.name)}</h3>
              <p className="mt-1">
                <span className="text-chalk/85">{t("tournament.mostPicked")}</span>
                {top ? (
                  <strong className="font-bold">
                    {player(top.pid)} · {top.entries.length} ({t("tournament.percent", { n: pct(top.entries.length, n) })})
                  </strong>
                ) : (
                  t("tournament.chipMissing")
                )}
              </p>
              <div className="mt-1.5 flex items-center gap-3 text-xs font-bold [font-stretch:85%]">
                <span className="w-14 shrink-0 tracking-[0.08em] uppercase">{t("tournament.survival")}</span>
                <span className="h-2.5 flex-1 bg-brick/50">
                  <span className="block h-full bg-chalk" style={{ width: `${pending ? 0 : pct(survived, entering)}%` }} />
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  {pending ? t("tournament.chipPending") : `${survived}/${entering} · ${t("tournament.percent", { n: pct(survived, entering) })}`}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </Box>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tableau                                                             */

type DrawFilter = "all" | "todo" | "won" | "lost"

function Draw({ data, d }: { data: Data; d: Derived }) {
  const fallback = d.currentRound ?? data.rounds[data.rounds.length - 1]
  const [roundId, setRoundId] = useState(fallback?.id)
  const [filter, setFilter] = useState<DrawFilter>("all")
  const [view, setView] = useState<"list" | "tree">("list")
  const [open, setOpen] = useState<string | null>(null)
  const [withPlayed, setWithPlayed] = useState(false)
  const round = data.rounds.find((r) => r.id === roundId) ?? fallback
  if (!round) return <Empty>{t("tournament.drawNotPublished")}</Empty>

  const toggle = (
    <Segmented
      label={t("tournament.drawView")}
      value={view}
      onChange={setView}
      options={[
        ["list", t("tournament.viewList")],
        ["tree", t("tournament.viewTree")],
      ]}
    />
  )
  if (view === "tree") {
    const inPlay = inPlayFrom(data)
    const from = withPlayed ? 0 : inPlay
    return (
      <div className="space-y-4">
        {toggle}
        {data.matches.length === 0 ? (
          <Empty>{t("tournament.noMatches")}</Empty>
        ) : (
          <>
            <p className="text-sm text-chalk/90">{t("tournament.drawHint")}</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <BracketLegend />
              {inPlay > 0 && (
                <ChipButton on={withPlayed} onClick={() => setWithPlayed(!withPlayed)}>
                  {t("tournament.showPlayed")}
                </ChipButton>
              )}
            </div>
            {/* Keyed by the start round: a new start remounts the box, so it starts scrolled to the left. */}
            <Bracket
              key={from}
              rounds={data.rounds.slice(from)}
              before={data.rounds[from - 1]}
              matches={data.matches}
              playerById={d.playerById}
              drawSize={Math.max(2, data.t.draw_size / 2 ** from)}
              pickByRound={d.myPicks}
            />
          </>
        )}
      </div>
    )
  }

  const prev = d.roundByIdx.get(round.idx - 1)
  const inRound = data.players
    .filter((p) => (d.lostRound.get(p.id) ?? Infinity) >= round.idx)
    .filter((p) => !prev || d.result.get(`${p.id}:${prev.id}`) === "won")
    .map((p) => ({ p, res: d.result.get(`${p.id}:${round.id}`) ?? null }))
    .sort((a, b) => (a.p.seed ?? 999) - (b.p.seed ?? 999) || a.p.name.localeCompare(b.p.name))
  const keyOf = (res: "won" | "lost" | null): DrawFilter => res ?? "todo"
  const count = (f: DrawFilter) => (f === "all" ? inRound.length : inRound.filter((x) => keyOf(x.res) === f).length)
  const shown = inRound.filter((x) => filter === "all" || keyOf(x.res) === filter)
  const filters: [DrawFilter, string][] = [
    ["all", t("tournament.filterAll")],
    ["todo", t("tournament.filterTodo")],
    ["won", t("tournament.filterWon")],
    ["lost", t("tournament.filterLost")],
  ]

  return (
    <div className="space-y-4">
      {toggle}
      <div className="flex flex-wrap gap-1.5">
        {data.rounds.map((r) => (
          <ChipButton key={r.id} on={r.id === round.id} onClick={() => setRoundId(r.id)}>
            {roundName(r.name)}
          </ChipButton>
        ))}
      </div>
      <p className="text-xs text-chalk/85">
        {t("tournament.drawCount", { count: inRound.length, date: formatDate(round.locks_at, true) })}
      </p>
      {inRound.length === 0 ? (
        <Empty>{t("tournament.noQualified")}</Empty>
      ) : (
        <>
          <div role="group" aria-label={t("tournament.filterPlayers")} className="flex flex-wrap gap-1.5">
            {filters.map(([f, label]) => (
              <ChipButton key={f} on={filter === f} onClick={() => setFilter(f)}>
                {label} <span className="tabular-nums opacity-80">{count(f)}</span>
              </ChipButton>
            ))}
          </div>
          {shown.length === 0 ? (
            <Empty>{t("tournament.noPlayerInFilter")}</Empty>
          ) : (
            <ul className="grid grid-cols-1 border-2 border-chalk/90 min-[520px]:grid-cols-2">
              {shown.map(({ p, res }) => (
                <li
                  key={p.id}
                  className={cn("border-b-2 border-chalk/40 text-sm min-[520px]:odd:border-r-2", res === "lost" && "text-chalk/70")}
                >
                  {/* Tap to show the whole match line (score, opponent). */}
                  <button
                    onClick={() => setOpen(open === p.id ? null : p.id)}
                    aria-expanded={open === p.id}
                    className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left hover:bg-chalk/10"
                  >
                    <span className="w-7 shrink-0 text-xs font-bold tabular-nums opacity-75">{p.seed ? `[${p.seed}]` : ""}</span>
                    <span className="min-w-0 flex-1">
                      <PlayerName p={p} className={cn(res === "won" ? "font-bold" : "font-medium", res === "lost" && "line-through")} />
                      <MatchLine m={d.matchOf.get(`${round.id}:${p.id}`)} pid={p.id} playerById={d.playerById} wrap={open === p.id} />
                    </span>
                    <ResultTag result={res} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

/** Toggle chip: round picker and filters in the Tableau tab. */
function ChipButton({ on, ...props }: ComponentProps<"button"> & { on: boolean }) {
  return (
    <button
      aria-pressed={on}
      {...props}
      className={cn(
        "min-h-11 rounded-[2px] border-2 px-2.5 text-[12px] font-bold tracking-[0.1em] uppercase [font-stretch:85%]",
        on ? "border-chalk bg-chalk text-ink" : "border-chalk/60 hover:bg-chalk/10",
      )}
    />
  )
}

/* ------------------------------------------------------------------ */

function Empty({ children }: { children: ReactNode }) {
  return <p className="border-2 border-dashed border-chalk/60 px-4 py-6 text-center text-chalk/90">{children}</p>
}
