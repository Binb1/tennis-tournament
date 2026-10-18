import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react"
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { ArrowLeft, Check, ChevronRight } from "lucide-react"

import { AppShell, Box, ChalkButton, ErrorBox, FindMe, LineButton, Loading, ME_ROW, PageTitle, ResultTag, SearchInput, Tag } from "@/components/court/AppShell"
import { Bracket } from "@/components/court/Bracket"
import { StakeCard } from "@/components/court/PointsStake"
import { Flag, MatchLine, PlayerName } from "@/components/court/PlayerLabel"
import { SocialIcons } from "@/components/court/Socials"
import { BallBoyRun, PixelNetFault, PixelWin, ShotClock } from "@/components/pixel/Animations"
import { useAuth } from "@/lib/auth"
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
}
type ChipState = "won" | "lost" | "pending" | "missing" | "waived" | "open"
type TrailStep = { round: Round; state: ChipState; player?: Player }

async function load(id: string): Promise<Data> {
  const { data: t, error } = await supabase.from("tournaments").select("*").eq("id", id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!t) throw new Error("Tournoi introuvable")
  const r = await supabase.from("rounds").select("*").eq("tournament_id", id).order("idx")
  if (r.error) throw new Error(r.error.message)
  const rounds = r.data as Round[]
  const roundIds = rounds.map((x) => x.id)
  const [players, results, entries, statuses, picks, waivers, matches, champions] = await Promise.all([
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
  ])
  return { t: t as Tournament, rounds, players, results, entries, statuses, picks, waivers, matches, champions }
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
    return load(id)
      .then((d) => {
        setData(d)
        setNow(Date.now())
      })
      .catch((e: Error) => setError(e.message))
  }, [id])

  useEffect(() => {
    reload()
  }, [reload])

  // Coarse clock so the current round flips when a lock passes.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const d = useMemo(() => (data ? derive(data, uid, now) : null), [data, uid, now])

  // Flip exactly at the lock too, so the picker closes when the countdown hits zero (not up to 30 s later).
  const lockAt = d?.currentRound ? new Date(d.currentRound.locks_at).getTime() : null
  useEffect(() => {
    if (lockAt == null) return
    const ms = lockAt - Date.now() + 50
    if (ms > 2 ** 31 - 1) return // setTimeout overflow: the 30 s clock covers it
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, ms))
    return () => clearTimeout(t)
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
    if (error) setJoinError(error.message)
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

  const { t } = data
  return (
    <AppShell>
      <BackLink />
      <PageTitle eyebrow={`${statusLabel(t.status, data.players.length > 0)} · ${t.tour}`}>{t.name}</PageTitle>
      <p className="-mt-2 mb-5 text-sm text-chalk/85">
        {formatDate(t.starts_at)} · {data.entries.length} {data.entries.length > 1 ? "inscrits" : "inscrit"}
      </p>

      {!t.test && data.rounds.length > 0 && <StakeCard category={t.category} rounds={data.rounds} />}

      {canJoin(t, data.rounds, now) && !d.myEntry && (
        <div className="mb-6 space-y-3">
          <ChalkButton onClick={join} disabled={joining} className="w-full">
            {joining ? "Inscription…" : "Rejoindre le tournoi"}
          </ChalkButton>
          {t.status === "live" && d.currentRound && (
            <p className="text-sm text-chalk/85">
              Inscription en cours de tournoi : les tours déjà joués ne comptent pas, tu commences au {d.currentRound.name}.
            </p>
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
      <ArrowLeft className="size-4" /> Tournois
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

  return { result, playerById, picksByEntry, livePicks, meetRound, myPath, roundByIdx, statusByEntry, lostRound, pickResult, currentRound, locked, noPick, trail, myEntry, myStatus, myPicks, matchOf, pointsOf, championOpen, championOf, championResult }
}
type Derived = ReturnType<typeof derive>

/* ------------------------------------------------------------------ */

type Tab = "pick" | "board" | "draw"
const TAB_PARAM: Record<Tab, string> = { pick: "choix", board: "classement", draw: "tableau" }
const TAB_OF: Record<string, Tab> = { choix: "pick", classement: "board", tableau: "draw" }

function Tabs({ value, onChange }: { value: Tab; onChange: (v: Tab) => void }) {
  const tabs = [
    ["pick", "Mon choix"],
    ["board", "Classement"],
    ["draw", "Tableau"],
  ] as const
  // Three court boxes separated by chalk lines.
  return (
    <div role="tablist" className="grid grid-cols-3 border-2 border-chalk/90">
      {tabs.map(([key, label], i) => (
        <button
          key={key}
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "min-h-11 px-2 py-2.5 text-[12px] font-bold tracking-[0.14em] uppercase transition-colors [font-stretch:85%]",
            i > 0 && "border-l-2 border-chalk/90",
            value === key ? "bg-chalk text-ink" : "hover:bg-chalk/10",
          )}
        >
          {label}
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
const CHIP_LABEL: Record<ChipState, string> = {
  won: "gagné",
  lost: "perdu",
  pending: "en attente",
  missing: "aucun choix",
  waived: "repêché",
  open: "à choisir",
}

function Chip({ step, withPlayer = false }: { step: TrailStep; withPlayer?: boolean }) {
  return (
    <span
      title={`${step.round.name} · ${step.player?.name ?? CHIP_LABEL[step.state]}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[2px] border-2 px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap [font-stretch:85%]",
        CHIP_STYLE[step.state],
      )}
    >
      <span className="tracking-[0.08em] uppercase">{step.round.name}</span>
      {withPlayer && (
        <span className="inline-flex items-center gap-1 font-medium normal-case">
          <Flag code={step.player?.country} />
          {step.player?.name ?? CHIP_LABEL[step.state]}
        </span>
      )}
      <span className="sr-only">{CHIP_LABEL[step.state]}</span>
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
          ? "Rejoins le tournoi pour faire ton premier choix."
          : "Tu n'es pas inscrit à ce tournoi."}
      </Empty>
    )
  }

  // History (locked rounds); the open rounds are in the grid below.
  const trail = d.trail(d.myEntry.id).filter((s) => d.locked(s.round))
  const alive = d.myStatus?.alive ?? true
  const pickedId = round ? d.myPicks.get(round.id) : undefined
  const isCurrent = !!round && round.id === d.currentRound?.id
  const filled = openRounds.filter((r) => d.myPicks.has(r.id)).length
  // Status line: the last locked round, whose result is the one to wait for.
  const lockedRounds = data.rounds.filter(d.locked)
  const statusRound = status === "live" ? lockedRounds[lockedRounds.length - 1] : undefined
  const statusPid = statusRound ? d.myPicks.get(statusRound.id) : undefined
  const roundName = (idx: number) => d.roundByIdx.get(idx)?.name ?? `tour ${idx}`
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

  return (
    <div className="space-y-6">
      {alive && round && <LockBlock round={round} planned={!isCurrent} points={d.pointsOf(round)} />}

      {alive && stale.length > 0 && (
        <div role="alert" className="border-l-4 border-ball bg-ink/70 px-4 py-3 text-sm font-medium">
          {stale.map((r) => r.name).join(", ")} : ton joueur prévu est éliminé. Change-le avant le verrouillage, sinon tu
          es éliminé.
        </div>
      )}

      <ChampionCard data={data} d={d} onChanged={onChanged} />

      {statusRound && statusPid && <ResultMoment id={`${d.myEntry.id}:${statusRound.id}`} result={d.pickResult(statusPid, statusRound)} />}

      {statusRound && statusPid && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-l-4 border-chalk bg-brick/40 px-4 py-3 text-sm">
          <span>Mon choix · {statusRound.name} :</span>
          <strong className="font-bold">
            <PlayerName p={d.playerById.get(statusPid)} />
          </strong>
          <ResultTag result={d.pickResult(statusPid, statusRound)} />
        </div>
      )}

      {trail.length > 0 && (
        <section>
          <h2 className="micro-label mb-2">Mon parcours</h2>
          <div className="flex flex-wrap gap-1.5">
            {trail.map((s) => (
              <Chip key={s.round.id} step={s} withPlayer />
            ))}
          </div>
        </section>
      )}

      {!alive ? (
        <Box className="px-4 py-5">
          <p className="font-display text-2xl">Éliminé</p>
          <p className="mt-1 text-chalk/90">
            Ton aventure s'arrête au {roundName(d.myStatus!.eliminated_round!)}. Suis la suite dans le classement.
          </p>
        </Box>
      ) : !round ? (
        <Empty>Aucun tour ouvert pour le moment.</Empty>
      ) : (
        <>
          {openRounds.length > 1 && (
            <ChalkButton onClick={onPlan} className="w-full">
              Remplir tous les tours
              <span className="ml-2 tabular-nums opacity-75">
                {filled}/{openRounds.length}
              </span>
            </ChalkButton>
          )}

          <section ref={gridRef} className="scroll-mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="micro-label">Mes choix à venir</h2>
              <Segmented
                label="Affichage de mes choix"
                value={view}
                onChange={setView}
                options={[
                  ["list", "Liste"],
                  ["tree", "Tableau"],
                ]}
              />
            </div>
            <RoundGrid rounds={openRounds} d={d} selected={round.id} onSelect={setRoundId} />
            {view === "tree" && <MyBracket data={data} d={d} round={round} boxClassName="max-h-[70svh]" />}
          </section>

          {!pickedId &&
            (isCurrent ? (
              <div role="status" className="border-l-4 border-ball bg-ink/70 px-4 py-3 text-sm font-medium">
                Pas encore de choix pour ce tour. Sans choix au verrouillage, tu es éliminé.
              </div>
            ) : (
              <div role="status" className="border-l-4 border-chalk bg-brick/40 px-4 py-3 text-sm">
                Tu peux préparer ce tour dès maintenant ou attendre : ton choix reste modifiable jusqu'à son
                verrouillage.
              </div>
            ))}

          <PlayerPicker key={round.id} data={data} d={d} round={round} onChanged={onChanged} onPicked={picked} />
        </>
      )}
    </div>
  )
}

/** My pick's result, played once per device: the player jumps for a win, the ball clips the net for a loss. */
function ResultMoment({ id, result }: { id: string; result: "won" | "lost" | undefined }) {
  if (!result) return null
  return (
    <Once id={`${result}:pick:${id}`}>
      <Box aria-hidden="true" className="flex justify-center px-4 py-4">
        {result === "won" ? <PixelWin /> : <PixelNetFault />}
      </Box>
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
    if (error) setError(error.message)
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
          <span className="micro-label">Pronostic du vainqueur</span>
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
          <p className="mt-2 font-display text-2xl leading-tight">Qui gagne le titre ?</p>
        )}
        <p className="mt-1 text-sm text-chalk/85">
          {editable
            ? "Modifiable jusqu'au verrouillage du 1er tour. Compte même si tu es éliminé."
            : "Compte même si tu es éliminé."}
        </p>
        {editable && (
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <LineButton onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? "Fermer" : pid ? "Changer" : "Choisir le vainqueur"}
            </LineButton>
            {pid && (
              <button
                onClick={() => save(null)}
                disabled={!!saving}
                className="min-h-11 text-xs font-medium text-chalk/90 underline underline-offset-2 hover:text-chalk"
              >
                {saving === "clear" ? "…" : "Retirer"}
              </button>
            )}
          </div>
        )}
      </Box>
      {error && <ErrorBox message={error} />}
      {open && editable && (
        <>
          <SearchInput value={q} onChange={setQ} placeholder="Chercher un joueur" />
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
            {list.length === 0 && <li className="px-3 py-4 text-sm text-chalk/80">Aucun joueur.</li>}
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
            <span className="block truncate text-[11px] font-bold tracking-[0.08em] uppercase [font-stretch:85%]">{r.name}</span>
            <span className={cn("block truncate text-xs", !pid && "opacity-70", out && "line-through")}>
              {pid ? shortName(d.playerById.get(pid)?.name ?? "") : "à choisir"}
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
  const roundName = (idx: number) => d.roundByIdx.get(idx)?.name ?? `tour ${idx}`

  // My picks in the other rounds of my path.
  const others = data.rounds.flatMap((r) => {
    const pid = r.id === round.id ? undefined : d.myPicks.get(r.id)
    return pid ? [{ r, pid }] : []
  })
  // Why a player can't be picked, or null if he can.
  const reason = (p: Player) => {
    const lost = d.lostRound.get(p.id)
    if (lost) return `Éliminé · ${roundName(lost)}`
    const used = others.find((o) => o.pid === p.id)
    if (used) return `${d.locked(used.r) ? "Déjà choisi" : "Prévu"} · ${used.r.name}`
    // Both must win up to the round they meet in: one of the two picks is a sure loss.
    const clash = others.find((o) => (d.meetRound(p.id, o.pid) ?? Infinity) <= Math.min(round.idx, o.r.idx))
    if (clash) return `Croise ${shortName(d.playerById.get(clash.pid)?.name ?? "")} · ${clash.r.name}`
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
    if (error) setError(error.message)
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
          Joueurs du tableau · {round.name} · +{d.pointsOf(round)} pts
        </h2>
        {pickedId ? (
          <button
            onClick={() => save("clear_pick", "clear", { p_round_id: round.id })}
            disabled={!!saving}
            className="min-h-11 text-xs font-medium text-chalk/90 underline underline-offset-2 hover:text-chalk"
          >
            {saving === "clear" ? "…" : "Retirer mon choix"}
          </button>
        ) : (
          <span className="text-xs text-chalk/80">Modifiable jusqu'au verrouillage</span>
        )}
      </div>
      <SearchInput value={q} onChange={setQ} placeholder="Chercher un joueur" />
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
                    Mon choix
                  </span>
                )}
                {saving === p.id && <span className="shrink-0 text-xs">…</span>}
              </button>
            </li>
          )
        })}
        {list.length === 0 && <li className="px-3 py-4 text-sm text-chalk/80">Aucun joueur.</li>}
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
            <span className="micro-label">{data.t.name}</span>
            <h1 className="font-display text-3xl leading-tight">Remplir mes tours</h1>
          </div>
          <LineButton onClick={onClose} className="shrink-0">
            Fermer
          </LineButton>
        </div>

        {!round ? (
          <Empty>Aucun tour ouvert pour le moment.</Empty>
        ) : (
          <>
            <div>
              <div className="flex items-baseline justify-between text-xs font-bold [font-stretch:85%]">
                <span className="tracking-[0.08em] uppercase">
                  Tour {step + 1} / {openRounds.length}
                </span>
                <span className="tabular-nums">
                  {filled}/{openRounds.length} {filled > 1 ? "remplis" : "rempli"}
                </span>
              </div>
              <span className="mt-1.5 block h-2.5 bg-brick/50">
                <span className="block h-full bg-chalk transition-[width]" style={{ width: `${(filled / openRounds.length) * 100}%` }} />
              </span>
            </div>

            <RoundGrid rounds={openRounds} d={d} selected={round.id} onSelect={(id) => setRoundId(id)} />

            <Box className="px-4 py-4">
              <span className="micro-label">
                {round.id === d.currentRound?.id ? "Verrouillage" : "Verrouillage prévu"} · {formatDate(round.locks_at, true)}
              </span>
              <p className="mt-1 font-display text-2xl leading-tight">{round.name}</p>
              <p className="mt-1 text-sm text-chalk/90">
                {pickedId ? (
                  <span className="inline-flex items-center gap-1.5">
                    Mon choix : <strong className="font-bold"><PlayerName p={d.playerById.get(pickedId)} rank={false} /></strong>
                  </span>
                ) : (
                  "Choisis le joueur qui gagne ce tour."
                )}
              </p>
              {pickedId && d.lostRound.has(pickedId) && (
                <p className="mt-2 border-l-4 border-ball pl-3 text-sm font-medium">Ce joueur est éliminé : change-le.</p>
              )}
            </Box>

            <PlayerPicker key={round.id} data={data} d={d} round={round} onChanged={onChanged} />

            {/* Step nav, always at hand under the long player list. */}
            <div className="clay-surface sticky bottom-(--tabbar) z-10 -mx-4 flex gap-2 border-t-2 border-chalk/90 px-4 py-3 lg:mx-0 lg:px-0">
              <LineButton onClick={() => go(step - 1)} disabled={step === 0} className="flex-1">
                ← Précédent
              </LineButton>
              {step < openRounds.length - 1 ? (
                <ChalkButton onClick={() => go(step + 1)} className="flex-1">
                  Suivant →
                </ChalkButton>
              ) : (
                <ChalkButton onClick={onClose} className="flex-1">
                  Terminer
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
  const [from, setFrom] = useState(0)
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

  if (data.matches.length === 0) return <Empty>Les matchs ne sont pas encore publiés.</Empty>
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-chalk/90">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-1 bg-ball" />
          <strong>mon choix</strong>
          <ChevronRight className="size-3.5 text-ball" aria-hidden="true" />
          passe
        </span>
        <span className="text-chalk/55 line-through">perd</span>
        <span>
          <i>prévu</i> · <Check className="inline size-3.5 align-[-0.15em]" aria-hidden="true" /> joué
        </span>
      </div>
      <div role="group" aria-label="Afficher à partir du tour" className="flex flex-wrap items-center gap-1.5">
        <span className="micro-label mr-1">Depuis</span>
        {data.rounds.slice(0, -1).map((r, i) => (
          <ChipButton key={r.id} on={i === from} onClick={() => setFrom(i)}>
            {r.name}
          </ChipButton>
        ))}
      </div>
      <div ref={drawRef} className={cn("overflow-auto overscroll-contain border-2 border-chalk/90", boxClassName)}>
        <Bracket
          key={from}
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

/** Big lock countdown: minutes when far, live seconds under 1 h, plus the local lock time. A later round's lock
 *  follows the order of play, so it is only an estimate until then. */
function LockBlock({ round, planned = false, points }: { round: Round; planned?: boolean; points?: number }) {
  const now = useNow(1000)
  const ms = new Date(round.locks_at).getTime() - now
  // Last hour of the round to play: shot clock (blinks under 10 min) and a ball boy running along the box.
  const hurry = !planned && ms > 0 && ms < 3_600_000
  return (
    <Box className={cn("scoreboard px-4 pt-4", hurry ? "pb-1" : "pb-4")}>
      <span className="micro-label">{round.name} · verrouillage {planned ? "prévu " : ""}dans</span>
      {hurry ? (
        <ShotClock ms={ms} className="mt-2" />
      ) : (
        <p className="scoreboard-digits mt-1 font-num text-4xl leading-tight tabular-nums">{formatLeft(ms)}</p>
      )}
      <p className="mt-1 text-sm text-chalk/85">
        Heure locale : {formatDate(round.locks_at, true)}
        {planned && " · suit le programme, peut avancer"}
        {points != null && ` · tour gagné : +${points} pts`}
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
    .sort((a, b) => Number(b.alive) - Number(a.alive) || b.survived - a.survived || a.name.localeCompare(b.name, "fr"))

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
  const maxSurvived = Math.max(0, ...rows.map((r) => r.survived))
  const isWinner = (r: (typeof rows)[number]) =>
    finished && total > 0 && (aliveCount > 0 ? r.alive : r.survived === maxSurvived)
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

  if (total === 0) return <Empty>Personne n'est encore inscrit.</Empty>

  return (
    <div className="space-y-6">
      <Box className="px-4 py-4">
        <div className="flex items-baseline justify-between">
          <span className="micro-label">Encore en vie</span>
          <span className="font-num text-3xl tabular-nums">
            {aliveCount}
            <span className="text-lg text-chalk/80"> / {total}</span>
          </span>
        </div>
        {funnel.length > 0 && (
          <ol className="mt-4 space-y-1.5 border-t-2 border-chalk/50 pt-4">
            {[{ label: "Inscrits", n: total }, ...funnel.map((f) => ({ label: f.r.name, n: f.n }))].map((f) => (
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
        label="Affichage du classement"
        value={view}
        onChange={setView}
        options={[
          ["list", "Liste"],
          ["grid", "Grille"],
          ["dist", "Répartition"],
          ["stats", "Stats"],
        ]}
      />

      {view === "dist" && <Distribution d={d} rounds={lockedRounds} />}

      {view === "stats" && <Stats data={data} d={d} rounds={lockedRounds} myRank={myRank} total={total} />}

      {(view === "list" || view === "grid") && (
        <div className="flex gap-2">
          <div className="flex-1">
            <SearchInput value={q} onChange={setQ} placeholder="Pseudo ou joueur" />
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
                      {me && <span className="ml-1.5 text-xs opacity-75">(moi)</span>}
                    </span>
                    {!r.e.profiles?.deleted_at && <SocialIcons p={r.e.profiles} />}
                  </span>
                  {isWinner(r) ? (
                    <Tag tone="win">{winnerCount > 1 ? "Co-vainqueur" : "Vainqueur"}</Tag>
                  ) : r.alive ? (
                    <Tag tone="alive">En vie</Tag>
                  ) : (
                    <Tag tone="out">Éliminé · {d.roundByIdx.get(r.out!)?.name}</Tag>
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
                    <span className="text-chalk/85">Pronostic du vainqueur :</span>
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
        {shown.length === 0 && <li className="px-3 py-4 text-sm text-chalk/80">Aucun résultat.</li>}
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
  if (rounds.length === 0) return <Empty>La grille apparaît quand le premier tour est verrouillé.</Empty>
  if (rows.length === 0) return <Empty>Aucun résultat.</Empty>

  return (
    <div className="relative overflow-x-auto overscroll-x-contain border-2 border-chalk/90">
      <table className="w-max min-w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b-2 border-chalk/90">
            <th scope="col" className="sticky left-0 z-10 clay-surface border-r-2 border-chalk/90 px-3 py-2">
              <span className="micro-label">Pseudo</span>
            </th>
            {rounds.map((r) => (
              <th
                key={r.id}
                scope="col"
                className="border-l-2 border-chalk/40 px-2 py-2 text-[11px] font-bold tracking-[0.1em] whitespace-nowrap uppercase [font-stretch:85%]"
              >
                {r.name}
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
                      title={`${r.name} · ${player?.name ?? CHIP_LABEL[state]}`}
                      className={cn("border-l-2 border-chalk/40 px-2 py-2 whitespace-nowrap", CELL_STYLE[state])}
                    >
                      {player ? (
                        <span className="inline-flex items-center gap-1">
                          <Flag code={player.country} />
                          {shortName(player.name)}
                        </span>
                      ) : state === "waived" ? (
                        "repêché"
                      ) : (
                        "–"
                      )}
                      <span className="sr-only"> · {CHIP_LABEL[state]}</span>
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
  if (rounds.length === 0) return <Empty>La répartition apparaît quand le premier tour est verrouillé.</Empty>

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
              <h3 className="font-display text-xl leading-tight">{r.name}</h3>
              <span className="micro-label">
                {total} choix
              </span>
            </div>
            {list.length === 0 ? (
              <p className="mt-3 border-t-2 border-chalk/50 pt-3 text-sm text-chalk/80">Aucun choix pour ce tour.</p>
            ) : (
              <ol className="mt-3 space-y-2 border-t-2 border-chalk/50 pt-3">
                {list.map(({ p, pid, n, lost }) => (
                  <li key={pid} className="text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={cn("min-w-0 flex-1 font-medium", lost && "text-chalk/65 line-through")}>
                        <PlayerName p={p} />
                        {lost && <span className="sr-only"> (éliminé)</span>}
                      </span>
                      <span className="shrink-0 text-xs font-bold tabular-nums">
                        {n} · {Math.round((n / total) * 100)} %
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
  if (rounds.length === 0) return <Empty>Les stats apparaissent quand le premier tour est verrouillé.</Empty>

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
          <span className="micro-label">Mon classement</span>
          <p className="mt-1 font-display text-3xl leading-tight">
            Tu es {myRank.rank}
            {myRank.rank === 1 ? "er" : "e"}
            {myRank.tied && " ex æquo"} <span className="text-lg text-chalk/85">sur {total}</span>
          </p>
        </Box>
      )}

      <Box className="px-4 py-4">
        <span className="micro-label">Choix le plus audacieux</span>
        {bold ? (
          <>
            <p className="mt-1 font-display text-2xl leading-tight">{player(bold.pid)}</p>
            <p className="mt-1 text-sm text-chalk/90">
              {bold.r.name} · qualifié, choisi par {bold.entries.length} seulement :{" "}
              {bold.entries.map((id) => nameOf.get(id)).join(", ")}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-chalk/85">Aucun joueur choisi ne s'est encore qualifié.</p>
        )}
      </Box>

      <Box className="px-4 py-4">
        <span className="micro-label">Plus grosse surprise</span>
        {upset ? (
          <>
            <p className="mt-1 font-display text-2xl leading-tight">{player(upset.pid)}</p>
            <p className="mt-1 text-sm text-chalk/90">
              {upset.r.name} · battu, {upset.entries.length}{" "}
              {upset.entries.length > 1 ? "inscrits éliminés d'un coup" : "inscrit éliminé"}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-chalk/85">Aucun joueur choisi n'a encore perdu.</p>
        )}
      </Box>

      <Box className="px-4 py-4">
        <span className="micro-label">Tour par tour</span>
        <ol className="mt-3 space-y-4 border-t-2 border-chalk/50 pt-3">
          {perRound.map(({ r, n, top, entering, survived, pending }) => (
            <li key={r.id} className="text-sm">
              <h3 className="font-display text-xl leading-tight">{r.name}</h3>
              <p className="mt-1">
                <span className="text-chalk/85">Le plus choisi : </span>
                {top ? (
                  <strong className="font-bold">
                    {player(top.pid)} · {top.entries.length} ({pct(top.entries.length, n)} %)
                  </strong>
                ) : (
                  "aucun choix"
                )}
              </p>
              <div className="mt-1.5 flex items-center gap-3 text-xs font-bold [font-stretch:85%]">
                <span className="w-14 shrink-0 tracking-[0.08em] uppercase">Survie</span>
                <span className="h-2.5 flex-1 bg-brick/50">
                  <span className="block h-full bg-chalk" style={{ width: `${pending ? 0 : pct(survived, entering)}%` }} />
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  {pending ? "en attente" : `${survived}/${entering} · ${pct(survived, entering)} %`}
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
  const [from, setFrom] = useState(0)
  const round = data.rounds.find((r) => r.id === roundId) ?? fallback
  if (!round) return <Empty>Le tableau n'est pas encore publié.</Empty>

  const toggle = (
    <Segmented
      label="Affichage du tableau"
      value={view}
      onChange={setView}
      options={[
        ["list", "Liste"],
        ["tree", "Arbre"],
      ]}
    />
  )
  if (view === "tree") {
    return (
      <div className="space-y-4">
        {toggle}
        {data.matches.length === 0 ? (
          <Empty>Les matchs ne sont pas encore publiés.</Empty>
        ) : (
          <>
            <div role="group" aria-label="Afficher à partir du tour" className="flex flex-wrap items-center gap-1.5">
              <span className="micro-label mr-1">Depuis</span>
              {data.rounds.slice(0, -1).map((r, i) => (
                <ChipButton key={r.id} on={i === from} onClick={() => setFrom(i)}>
                  {r.name}
                </ChipButton>
              ))}
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
    ["all", "Tous"],
    ["todo", "À jouer"],
    ["won", "Qualifiés"],
    ["lost", "Éliminés"],
  ]

  return (
    <div className="space-y-4">
      {toggle}
      <div className="flex flex-wrap gap-1.5">
        {data.rounds.map((r) => (
          <ChipButton key={r.id} on={r.id === round.id} onClick={() => setRoundId(r.id)}>
            {r.name}
          </ChipButton>
        ))}
      </div>
      <p className="text-xs text-chalk/85">
        {inRound.length} {inRound.length > 1 ? "joueurs" : "joueur"} · verrouillage {formatDate(round.locks_at, true)}
      </p>
      {inRound.length === 0 ? (
        <Empty>Aucun joueur qualifié pour ce tour pour l'instant.</Empty>
      ) : (
        <>
          <div role="group" aria-label="Filtrer les joueurs" className="flex flex-wrap gap-1.5">
            {filters.map(([f, label]) => (
              <ChipButton key={f} on={filter === f} onClick={() => setFilter(f)}>
                {label} <span className="tabular-nums opacity-80">{count(f)}</span>
              </ChipButton>
            ))}
          </div>
          {shown.length === 0 ? (
            <Empty>Aucun joueur dans cette catégorie.</Empty>
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
