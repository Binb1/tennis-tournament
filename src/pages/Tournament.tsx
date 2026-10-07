import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, Search } from "lucide-react"

import { AppShell, Box, ChalkButton, ErrorBox, Loading, PageTitle, ResultTag, Tag } from "@/components/court/AppShell"
import { Bracket } from "@/components/court/Bracket"
import { Flag, MatchLine, PlayerName } from "@/components/court/PlayerLabel"
import { SocialIcons } from "@/components/court/Socials"
import { useAuth } from "@/lib/auth"
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
  const [players, results, entries, statuses, picks, waivers, matches] = await Promise.all([
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
  ])
  return { t: t as Tournament, rounds, players, results, entries, statuses, picks, waivers, matches }
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
  const [tab, setTab] = useState<"pick" | "board" | "draw">("pick")
  const [now, setNow] = useState(() => Date.now())
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

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

  const { t } = data
  return (
    <AppShell>
      <BackLink />
      <PageTitle eyebrow={`${statusLabel(t.status, data.players.length > 0)} · ${t.tour}`}>{t.name}</PageTitle>
      <p className="-mt-2 mb-5 text-sm text-chalk/85">
        {formatDate(t.starts_at)} · {data.entries.length} {data.entries.length > 1 ? "inscrits" : "inscrit"}
      </p>

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
        {tab === "pick" && <MyPick data={data} d={d} onChanged={reload} />}
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
        const res = result.get(`${pid}:${round.id}`)
        return { round, player, state: res === "won" ? "won" : res === "lost" ? "lost" : "pending" }
      })
  }

  const myEntry = data.entries.find((e) => e.user_id && e.user_id === uid) ?? null
  const myStatus = myEntry ? statusByEntry.get(myEntry.id) ?? null : null
  const myPicks = myEntry ? picksByEntry.get(myEntry.id) ?? new Map<string, string>() : new Map<string, string>()

  // A player's match in a round: "<round id>:<player id>" -> match.
  const matchOf = new Map<string, Match>()
  for (const m of data.matches) {
    if (m.player1_id) matchOf.set(`${m.round_id}:${m.player1_id}`, m)
    if (m.player2_id) matchOf.set(`${m.round_id}:${m.player2_id}`, m)
  }

  return { result, playerById, picksByEntry, roundByIdx, statusByEntry, lostRound, currentRound, locked, noPick, trail, myEntry, myStatus, myPicks, matchOf }
}
type Derived = ReturnType<typeof derive>

/* ------------------------------------------------------------------ */

function Tabs({ value, onChange }: { value: "pick" | "board" | "draw"; onChange: (v: "pick" | "board" | "draw") => void }) {
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

function MyPick({ data, d, onChanged }: { data: Data; d: Derived; onChanged: () => Promise<void> }) {
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  // Picks are open during registration (round 1 only) and live.
  const status = data.t.status
  const round =
    status === "live" || (status === "registration" && d.currentRound?.idx === 1) ? d.currentRound : null

  if (!d.myEntry) {
    return (
      <Empty>
        {data.t.status === "registration"
          ? "Rejoins le tournoi pour faire ton premier choix."
          : "Tu n'es pas inscrit à ce tournoi."}
      </Empty>
    )
  }

  const trail = d.trail(d.myEntry.id)
  const alive = d.myStatus?.alive ?? true
  const pickedId = round ? d.myPicks.get(round.id) : undefined
  // Round of the status line: the open round, else (live) the last locked one.
  const lockedRounds = data.rounds.filter(d.locked)
  const statusRound = round ?? (status === "live" ? lockedRounds[lockedRounds.length - 1] : undefined)
  const statusPid = statusRound ? d.myPicks.get(statusRound.id) : undefined
  const roundName = (idx: number) => d.roundByIdx.get(idx)?.name ?? `tour ${idx}`

  // Why a player can't be picked, or null if he can.
  const usedIn = new Map<string, string>()
  for (const [roundId, pid] of d.myPicks) if (roundId !== round?.id) usedIn.set(pid, roundId)
  const reason = (p: Player) => {
    const lost = d.lostRound.get(p.id)
    if (lost) return `Éliminé · ${roundName(lost)}`
    const used = usedIn.get(p.id)
    if (used) return `Déjà choisi · ${data.rounds.find((r) => r.id === used)?.name ?? ""}`
    return null
  }
  const needle = q.trim().toLowerCase()
  const list = data.players
    .filter((p) => !needle || p.name.toLowerCase().includes(needle))
    .map((p) => ({ p, why: reason(p) }))
    .sort((a, b) => Number(!!a.why) - Number(!!b.why) || (a.p.seed ?? 999) - (b.p.seed ?? 999) || a.p.name.localeCompare(b.p.name))

  async function pick(p: Player) {
    if (!round) return
    setSaving(p.id)
    setError(null)
    const { error } = await supabase.rpc("make_pick", { p_round_id: round.id, p_player_id: p.id })
    if (error) setError(error.message)
    else await onChanged()
    setSaving(null)
  }

  return (
    <div className="space-y-6">
      {alive && round && <LockBlock round={round} />}

      {statusRound && statusPid && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-l-4 border-chalk bg-brick/40 px-4 py-3 text-sm">
          <span>Mon choix · {statusRound.name} :</span>
          <strong className="font-bold">
            <PlayerName p={d.playerById.get(statusPid)} />
          </strong>
          <ResultTag result={d.result.get(`${statusPid}:${statusRound.id}`)} />
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
          {!pickedId && (
            <div role="status" className="border-l-4 border-ball bg-ink/70 px-4 py-3 text-sm font-medium">
              Pas encore de choix pour ce tour. Sans choix au verrouillage, tu es éliminé.
            </div>
          )}
          {error && <ErrorBox message={error} />}

          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 className="micro-label">Joueurs du tableau</h2>
              <span className="text-xs text-chalk/80">Modifiable jusqu'au verrouillage</span>
            </div>
            <SearchInput value={q} onChange={setQ} placeholder="Chercher un joueur" />
            <ul className="mt-3 border-2 border-chalk/90">
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
        </>
      )}
    </div>
  )
}

/** Big lock countdown: minutes when far, live seconds under 1 h, plus the local lock time. */
function LockBlock({ round }: { round: Round }) {
  const now = useNow(1000)
  return (
    <Box className="scoreboard px-4 py-4">
      <span className="micro-label">{round.name} · verrouillage dans</span>
      <p className="scoreboard-digits mt-1 font-num text-4xl leading-tight tabular-nums">
        {formatLeft(new Date(round.locks_at).getTime() - now)}
      </p>
      <p className="mt-1 text-sm text-chalk/85">Heure locale : {formatDate(round.locks_at, true)}</p>
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

      {view === "dist" && <Distribution data={data} d={d} rounds={lockedRounds} />}

      {view === "stats" && <Stats data={data} d={d} rounds={lockedRounds} myRank={myRank} total={total} />}

      {(view === "list" || view === "grid") && <SearchInput value={q} onChange={setQ} placeholder="Pseudo ou joueur" />}

      {view === "grid" && <Grid d={d} rounds={lockedRounds} rows={shown} uid={uid} />}

      {view === "list" && <ul className="border-2 border-chalk/90">
        {shown.map((r) => {
          const on = highlight === r.e.id
          const me = !!uid && r.e.user_id === uid
          return (
            <li key={r.e.id} className="border-t-2 border-chalk/50 first:border-t-0">
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
                  const res = pid ? d.result.get(`${pid}:${r.id}`) : undefined
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
function Distribution({ data, d, rounds }: { data: Data; d: Derived; rounds: Round[] }) {
  if (rounds.length === 0) return <Empty>La répartition apparaît quand le premier tour est verrouillé.</Empty>

  return (
    <div className="space-y-4">
      {[...rounds].reverse().map((r) => {
        const counts = new Map<string, number>()
        for (const p of data.picks) if (p.round_id === r.id) counts.set(p.player_id, (counts.get(p.player_id) ?? 0) + 1)
        const total = [...counts.values()].reduce((a, b) => a + b, 0)
        const list = [...counts]
          .map(([pid, n]) => ({ p: d.playerById.get(pid), pid, n, lost: d.result.get(`${pid}:${r.id}`) === "lost" }))
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
    for (const p of data.picks) if (p.round_id === r.id) byPlayer.set(p.player_id, [...(byPlayer.get(p.player_id) ?? []), p.entry_id])
    return [...byPlayer].map(([pid, entries]) => ({ r, pid, entries, res: d.result.get(`${pid}:${r.id}`) ?? null }))
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

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-chalk/70" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-[2px] border-2 border-chalk/90 bg-brick/25 pr-3 pl-9 text-base text-chalk placeholder:text-chalk/55 focus:bg-brick/40 focus:outline-none"
      />
    </label>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="border-2 border-dashed border-chalk/60 px-4 py-6 text-center text-chalk/90">{children}</p>
}
