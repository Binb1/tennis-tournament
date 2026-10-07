import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft } from "lucide-react"

import { AppShell, Box, ChalkButton, ErrorBox, LineButton, Loading, PageTitle, Tag } from "@/components/court/AppShell"
import { suggestTheme, themeLabel, useThemeOverride } from "@/lib/theme"
import { formatTime, useNow } from "@/lib/time"
import { cn } from "@/lib/utils"
import { logAdmin, selectClass, ThemeSelect } from "@/pages/admin/AdminHome"
import {
  STATUS_LABEL,
  displayName,
  fetchAll,
  formatDate,
  supabase,
  type EntryStatus,
  type Pick,
  type Player,
  type Round,
  type Tournament,
  type TournamentStatus,
  type Waiver,
} from "@/lib/supabase"

type ResultRow = { player_id: string; round_id: string; result: "won" | "lost" | null; source: "manual" | "api" }
type EntryRow = { id: string; user_id: string | null; profiles: { username: string; deleted_at: string | null } | null }
type LogRow = { id: number; action: string; payload: unknown; at: string; profiles: { username: string } | null }
type Data = {
  t: Tournament
  rounds: Round[]
  players: Player[]
  results: ResultRow[]
  entries: EntryRow[]
  statuses: EntryStatus[]
  picks: Pick[]
  waivers: Waiver[]
  log: LogRow[]
}

const STEPS: TournamentStatus[] = ["draft", "registration", "live", "finished"]

async function load(id: string): Promise<Data> {
  const { data: t, error } = await supabase.from("tournaments").select("*").eq("id", id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!t) throw new Error("Tournoi introuvable")
  const r = await supabase.from("rounds").select("*").eq("tournament_id", id).order("idx")
  if (r.error) throw new Error(r.error.message)
  const rounds = r.data as Round[]
  const roundIds = rounds.map((x) => x.id)
  const [players, results, entries, statuses, picks, waivers, log] = await Promise.all([
    fetchAll<Player>((a, b) => supabase.from("players").select("id, name, seed").eq("tournament_id", id).order("seed").order("name").range(a, b)),
    fetchAll<ResultRow>((a, b) =>
      supabase.from("player_results").select("player_id, round_id, result, source").in("round_id", roundIds).order("player_id").order("round_id").range(a, b),
    ),
    fetchAll<EntryRow>((a, b) =>
      supabase.from("entries").select("id, user_id, profiles(username, deleted_at)").eq("tournament_id", id).order("joined_at").order("id").range(a, b),
    ),
    fetchAll<EntryStatus>((a, b) => supabase.from("entry_status").select("*").eq("tournament_id", id).order("entry_id").range(a, b)),
    fetchAll<Pick>((a, b) => supabase.from("picks").select("entry_id, round_id, player_id").in("round_id", roundIds).order("entry_id").order("round_id").range(a, b)),
    fetchAll<Waiver>((a, b) => supabase.from("pick_waivers").select("entry_id, round_id").in("round_id", roundIds).order("entry_id").order("round_id").range(a, b)),
    supabase.from("admin_log").select("id, action, payload, at, profiles(username)").order("at", { ascending: false }).limit(50),
  ])
  if (log.error) throw new Error(log.error.message)
  return { t: t as Tournament, rounds, players, results, entries, statuses, picks, waivers, log: log.data as unknown as LogRow[] }
}

/** ISO -> value for <input type="datetime-local"> (local time). */
function toLocalInput(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Keyed by id: going from one tournament to another (back/forward) starts from a clean state. */
export default function AdminTournament() {
  const { id = "" } = useParams()
  return <AdminTournamentView key={id} id={id} />
}

function AdminTournamentView({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    setError(null)
    return load(id)
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [id])

  useEffect(() => {
    reload()
  }, [reload])
  useThemeOverride(data?.t.theme)

  return (
    <AppShell>
      <Link to="/admin" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-chalk/90 hover:text-chalk">
        <ArrowLeft className="size-4" /> Admin
      </Link>
      {!data ? (
        error ? <ErrorBox message={error} onRetry={reload} /> : <Loading />
      ) : (
        <>
          <PageTitle eyebrow={`${STATUS_LABEL[data.t.status]} · ${data.t.tour} · tableau ${data.t.draw_size}`}>{data.t.name}</PageTitle>
          {error && <div className="mb-4"><ErrorBox message={error} onRetry={reload} /></div>}
          <div className="space-y-8">
            <StatusSection data={data} onChanged={reload} />
            <StyleSection data={data} onChanged={reload} />
            <CurrentRoundSection data={data} />
            <RoundsSection data={data} onChanged={reload} />
            <DrawSection data={data} onChanged={reload} />
            <ResultsSection data={data} onChanged={reload} />
            <SyncSection data={data} onChanged={reload} />
            <EntriesSection data={data} onChanged={reload} />
            <LogSection data={data} />
          </div>
        </>
      )}
    </AppShell>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="micro-label mb-3">{title}</h2>
      <Box className="px-4 py-4">{children}</Box>
    </section>
  )
}

type Props = { data: Data; onChanged: () => Promise<void> }

/** Runs an async write, shows its error inline, reloads on success. */
function useWrite(onChanged: () => Promise<void>) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function run(key: string, fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(key)
    setError(null)
    const { error } = await fn()
    if (error) setError(error.message)
    else await onChanged()
    setBusy(null)
    return !error
  }
  return { busy, error, run }
}

/* 1. Statut ----------------------------------------------------------- */

function StatusSection({ data, onChanged }: Props) {
  const { busy, error, run } = useWrite(onChanged)
  const i = STEPS.indexOf(data.t.status)
  const prev = STEPS[i - 1]
  const next = STEPS[i + 1]

  function move(status: TournamentStatus) {
    return run(status, async () => {
      const res = await supabase.from("tournaments").update({ status }).eq("id", data.t.id)
      if (!res.error) await logAdmin("set_status", { tournament_id: data.t.id, from: data.t.status, to: status })
      return res
    })
  }

  return (
    <Section title="Statut">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {STEPS.map((s) => (
          <span
            key={s}
            className={cn(
              "rounded-[2px] border-2 px-2 py-0.5 text-[11px] font-bold tracking-[0.12em] uppercase [font-stretch:85%]",
              s === data.t.status ? "border-chalk bg-chalk text-ink" : "border-chalk/40 text-chalk/70",
            )}
          >
            {STATUS_LABEL[s]}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {next && (
          <ChalkButton onClick={() => move(next)} disabled={!!busy}>
            Passer à « {STATUS_LABEL[next]} »
          </ChalkButton>
        )}
        {prev && (
          <LineButton onClick={() => move(prev)} disabled={!!busy}>
            Revenir à « {STATUS_LABEL[prev]} »
          </LineButton>
        )}
      </div>
      {error && <div className="mt-3"><ErrorBox message={error} /></div>}
    </Section>
  )
}

/* 1b. Style ---------------------------------------------------------- */

function StyleSection({ data, onChanged }: Props) {
  const { busy, error, run } = useWrite(onChanged)
  const current = data.t.theme ?? ""
  const suggested = suggestTheme(data.t.name)

  function save(theme: string) {
    return run("theme", async () => {
      const res = await supabase.from("tournaments").update({ theme: theme || null }).eq("id", data.t.id)
      if (!res.error) await logAdmin("set_theme", { tournament_id: data.t.id, from: data.t.theme ?? null, to: theme || null })
      return res
    })
  }

  return (
    <Section title="Style">
      <ThemeSelect bare value={current} onChange={save} disabled={!!busy} />
      {suggested && suggested !== current && (
        <p className="mt-2 text-sm text-chalk/85">
          Suggéré d'après le nom : {themeLabel(suggested)}.{" "}
          <button type="button" className="font-bold underline underline-offset-4" disabled={!!busy} onClick={() => save(suggested)}>
            Appliquer
          </button>
        </p>
      )}
      {error && <div className="mt-3"><ErrorBox message={error} /></div>}
    </Section>
  )
}

/* 2. Tours ------------------------------------------------------------ */

function RoundsSection({ data, onChanged }: Props) {
  return (
    <Section title="Tours">
      <ul className="space-y-4">
        {data.rounds.map((r) => (
          <RoundRow key={r.id} round={r} onChanged={onChanged} />
        ))}
        {data.rounds.length === 0 && <li className="text-sm text-chalk/80">Aucun tour.</li>}
      </ul>
    </Section>
  )
}

function RoundRow({ round, onChanged }: { round: Round; onChanged: () => Promise<void> }) {
  const [name, setName] = useState(round.name)
  const [locksAt, setLocksAt] = useState(toLocalInput(round.locks_at))
  const { busy, error, run } = useWrite(onChanged)
  const locked = new Date(round.locks_at).getTime() <= Date.now()
  const dirty = name !== round.name || locksAt !== toLocalInput(round.locks_at)

  function save() {
    return run("save", async () => {
      const patch = { name: name.trim(), locks_at: new Date(locksAt).toISOString() }
      const res = await supabase.from("rounds").update(patch).eq("id", round.id)
      if (!res.error) await logAdmin("update_round", { round_id: round.id, ...patch })
      return res
    })
  }

  const input =
    "h-11 w-full rounded-[2px] border-2 border-chalk/90 bg-brick/25 px-3 text-base text-chalk focus:bg-brick/40 focus:outline-none disabled:opacity-60"
  return (
    <li className="border-t-2 border-chalk/40 pt-4 first:border-t-0 first:pt-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="micro-label">Tour {round.idx}</span>
        {locked && <Tag tone="out">Verrouillé</Tag>}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input aria-label="Nom du tour" className={input} value={name} disabled={locked} onChange={(e) => setName(e.target.value)} />
        <input
          aria-label="Verrouillage"
          type="datetime-local"
          className={input}
          value={locksAt}
          disabled={locked}
          onChange={(e) => setLocksAt(e.target.value)}
        />
        <LineButton onClick={save} disabled={locked || !dirty || !name.trim() || !locksAt || !!busy}>
          {busy ? "…" : "Enregistrer"}
        </LineButton>
      </div>
      {error && <div className="mt-2"><ErrorBox message={error} /></div>}
    </li>
  )
}

/* 3. Tableau ---------------------------------------------------------- */

function DrawSection({ data, onChanged }: Props) {
  const [csv, setCsv] = useState("")
  const { busy, error, run } = useWrite(onChanged)
  const [apiMsg, setApiMsg] = useState<string | null>(null)
  const editable = data.t.status === "draft" || data.t.status === "registration"

  async function importFromApi() {
    setApiMsg(null)
    await run("api", async () => {
      const { data: res, error } = await supabase.functions.invoke("sync-results", {
        body: { tournament_id: data.t.id, action: "import_draw" },
      })
      // Non-2xx: the function's {error} is in the response body.
      const body = error?.context instanceof Response ? await error.context.json().catch(() => null) : null
      const message = body?.error ?? error?.message ?? res?.error
      if (message) return { error: { message } }
      setApiMsg(`${res.inserted} joueur(s) ajouté(s)`)
      await logAdmin("import_draw_api", { tournament_id: data.t.id, count: res.inserted })
      return { error: null }
    })
  }

  async function importCsv() {
    const rows = csv
      .split("\n")
      .map((line) => line.split(",").map((c) => c.trim()))
      .filter(([name]) => name && !["nom", "name"].includes(name.toLowerCase()))
      .map(([name, seed, externalId]) => ({
        tournament_id: data.t.id,
        name,
        seed: seed ? Number(seed) || null : null,
        external_id: externalId || null,
      }))
    if (!rows.length) return
    const ok = await run("import", async () => {
      const res = await supabase.from("players").insert(rows)
      if (!res.error) await logAdmin("import_players", { tournament_id: data.t.id, count: rows.length })
      return res
    })
    if (ok) setCsv("")
  }

  function remove(p: Player) {
    if (!confirm(`Retirer ${p.name} du tableau ? Les choix qui le concernent seront supprimés.`)) return
    return run(p.id, async () => {
      const res = await supabase.from("players").delete().eq("id", p.id)
      if (!res.error) await logAdmin("remove_player", { tournament_id: data.t.id, player_id: p.id, name: p.name })
      return res
    })
  }

  return (
    <Section title={`Tableau · ${data.players.length}/${data.t.draw_size} joueurs`}>
      {editable ? (
        <div className="mb-5 space-y-3">
          {data.t.external_id && (
            <>
              <ChalkButton onClick={importFromApi} disabled={!!busy} className="w-full">
                {busy === "api" ? "Import…" : "Importer le tableau"}
              </ChalkButton>
              {apiMsg && <p className="text-sm font-medium">{apiMsg}</p>}
            </>
          )}
          <label className="block">
            <span className="micro-label mb-2">Coller un CSV : nom,tête de série,external_id</span>
            <textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              rows={6}
              placeholder={"Carlos Alcaraz,1,\nJannik Sinner,2,\nQualifié A,,"}
              className="w-full rounded-[2px] border-2 border-chalk/90 bg-brick/25 px-3 py-2 font-mono text-sm text-chalk placeholder:text-chalk/50 focus:bg-brick/40 focus:outline-none"
            />
          </label>
          <ChalkButton onClick={importCsv} disabled={!csv.trim() || !!busy} className="w-full">
            {busy === "import" ? "Import…" : "Importer les joueurs"}
          </ChalkButton>
        </div>
      ) : (
        <p className="mb-4 text-sm text-chalk/85">Le tableau n'est plus modifiable une fois le tournoi en cours.</p>
      )}
      {error && <div className="mb-3"><ErrorBox message={error} /></div>}
      <ul className="border-2 border-chalk/90">
        {data.players.map((p) => (
          <li key={p.id} className="flex min-h-11 items-center gap-3 border-t-2 border-chalk/50 px-3 py-1.5 first:border-t-0">
            <span className="w-8 shrink-0 text-xs font-bold opacity-70 tabular-nums">{p.seed ? `[${p.seed}]` : ""}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
            {editable && (
              <button
                onClick={() => remove(p)}
                disabled={!!busy}
                className="shrink-0 text-xs font-bold underline underline-offset-4 disabled:opacity-50"
              >
                Retirer
              </button>
            )}
          </li>
        ))}
        {data.players.length === 0 && <li className="px-3 py-4 text-sm text-chalk/80">Aucun joueur.</li>}
      </ul>
    </Section>
  )
}

/* Results helpers ---------------------------------------------------- */

/** Result lookup + the players still in each round (not out before it, winners of the previous one). */
function resultsIndex(data: Data) {
  const idxOf = new Map(data.rounds.map((r) => [r.id, r.idx]))
  const resultOf = new Map(data.results.map((r) => [`${r.player_id}:${r.round_id}`, r]))
  const lostAt = new Map<string, number>()
  for (const r of data.results) {
    const idx = idxOf.get(r.round_id) ?? 0
    if (r.result === "lost" && idx < (lostAt.get(r.player_id) ?? Infinity)) lostAt.set(r.player_id, idx)
  }
  const inPlayOf = (r: Round) => {
    const prev = data.rounds.find((x) => x.idx === r.idx - 1)
    return data.players.filter(
      (p) => (lostAt.get(p.id) ?? Infinity) >= r.idx && (!prev || resultOf.get(`${p.id}:${prev.id}`)?.result === "won"),
    )
  }
  return { resultOf, inPlayOf }
}

/* 1b. Tour en cours --------------------------------------------------- */

function CurrentRoundSection({ data }: { data: Data }) {
  const now = Date.now()
  const round = data.rounds.find((r) => new Date(r.locks_at).getTime() > now) ?? data.rounds[data.rounds.length - 1]
  if (!round) return null
  const locked = new Date(round.locks_at).getTime() <= now
  const { resultOf, inPlayOf } = resultsIndex(data)

  // Entries still alive when the round starts must pick.
  const statusOf = new Map(data.statuses.map((s) => [s.entry_id, s]))
  const playing = data.entries.filter((e) => {
    const out = statusOf.get(e.id)?.eliminated_round
    return out == null || out >= round.idx
  })
  const pickedBy = new Set(data.picks.filter((p) => p.round_id === round.id).map((p) => p.entry_id))
  const missing = playing.filter((e) => !pickedBy.has(e.id))

  const inPlay = inPlayOf(round)
  const toPlay = inPlay.filter((p) => !resultOf.get(`${p.id}:${round.id}`)?.result)

  return (
    <Section title={`Tour en cours · ${round.name}`}>
      <p className="mb-4 text-sm text-chalk/85">
        {locked ? "Verrouillé depuis" : "Verrouillage"} {formatDate(round.locks_at, true)}
      </p>

      <span className="micro-label">Participants</span>
      <p className="mt-1 font-num text-2xl leading-tight tabular-nums">
        {playing.length - missing.length}/{playing.length} ont choisi
      </p>
      {playing.length === 0 ? (
        <p className="mt-1 text-sm text-chalk/85">Aucun inscrit encore en jeu.</p>
      ) : missing.length === 0 ? (
        <p className="mt-1 text-sm text-chalk/85">Tout le monde a choisi.</p>
      ) : (
        <p className="mt-1 text-sm">
          <span className="text-chalk/85">{locked ? "Sans choix (éliminés) : " : "Pas encore choisi : "}</span>
          {missing.map((e) => displayName(e.profiles)).join(", ")}
        </p>
      )}

      <div className="mt-4 border-t-2 border-chalk/50 pt-4">
        <span className="micro-label">Joueurs encore en lice · {inPlay.length}</span>
        <div className="mt-2 flex flex-wrap gap-2">
          <Tag tone="alive">Joué · {inPlay.length - toPlay.length}</Tag>
          <Tag tone="neutral">À jouer · {toPlay.length}</Tag>
        </div>
        {toPlay.length > 0 && (
          <p className="mt-2 text-sm">
            <span className="text-chalk/85">À jouer : </span>
            {toPlay.map((p) => p.name).join(", ")}
          </p>
        )}
      </div>
    </Section>
  )
}

/* 4. Résultats -------------------------------------------------------- */

function ResultsSection({ data, onChanged }: Props) {
  const { busy, error, run } = useWrite(onChanged)
  const { resultOf, inPlayOf } = resultsIndex(data)
  // Open the first round that still has players without a result.
  const current = data.rounds.find((r) => inPlayOf(r).some((p) => !resultOf.get(`${p.id}:${r.id}`)?.result))

  function set(p: Player, r: Round, result: "won" | "lost" | null) {
    return run(`${p.id}:${r.id}`, () =>
      supabase.rpc("set_result", { p_player_id: p.id, p_round_id: r.id, p_result: result }),
    )
  }

  return (
    <section>
      <h2 className="micro-label mb-3">Résultats</h2>
      <p className="mb-3 text-sm text-chalk/85">
        <Tag tone="neutral">API</Tag> rempli par la synchro. <Tag tone="alert">Manuel</Tag> saisi ici : la synchro ne
        l'écrase jamais. « Rendre à l'API » efface la saisie, la prochaine synchro la remplit.
      </p>
      {error && <div className="mb-3"><ErrorBox message={error} /></div>}
      <div className="space-y-3">
        {data.rounds.map((r) => {
          const inPlay = inPlayOf(r)
          const done = inPlay.filter((p) => resultOf.get(`${p.id}:${r.id}`)?.result).length
          return (
            <details key={r.id} open={r.id === current?.id} className="border-2 border-chalk/90">
              <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-3">
                <span className="font-display text-xl leading-tight">{r.name}</span>
                <span className="text-xs font-bold tabular-nums">
                  {done}/{inPlay.length}
                </span>
              </summary>
              <ul>
                {inPlay.map((p) => {
                  const res = resultOf.get(`${p.id}:${r.id}`)
                  const key = `${p.id}:${r.id}`
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t-2 border-chalk/50 px-3 py-2">
                      <span className="w-8 shrink-0 text-xs font-bold opacity-70 tabular-nums">{p.seed ? `[${p.seed}]` : ""}</span>
                      {/* Name + source on the first line; result controls wrap below on phones. */}
                      <span className="min-w-0 flex-1 basis-40 truncate font-medium">{p.name}</span>
                      {res && <Tag tone={res.source === "api" ? "neutral" : "alert"}>{res.source === "api" ? "API" : "Manuel"}</Tag>}
                      <span className="basis-full sm:hidden" aria-hidden="true" />
                      <span className="w-8 shrink-0 sm:hidden" aria-hidden="true" />
                      <ResultToggle value={res?.result ?? null} disabled={busy === key} onChange={(v) => set(p, r, v)} />
                      {res?.source === "manual" && (
                        <button
                          onClick={() => set(p, r, null)}
                          disabled={busy === key}
                          className="min-h-9 shrink-0 text-xs font-bold underline underline-offset-4 disabled:opacity-50"
                        >
                          Rendre à l'API
                        </button>
                      )}
                    </li>
                  )
                })}
                {inPlay.length === 0 && <li className="border-t-2 border-chalk/50 px-3 py-3 text-sm text-chalk/80">Aucun joueur.</li>}
              </ul>
            </details>
          )
        })}
      </div>
    </section>
  )
}

function ResultToggle({
  value,
  disabled,
  onChange,
}: {
  value: "won" | "lost" | null
  disabled: boolean
  onChange: (v: "won" | "lost" | null) => void
}) {
  const opts = [
    ["won", "Gagné"],
    ["lost", "Perdu"],
    [null, "—"],
  ] as const
  return (
    <div className="flex shrink-0 border-2 border-chalk/90">
      {opts.map(([v, label], i) => (
        <button
          key={label}
          disabled={disabled || value === v}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "min-h-9 px-2.5 text-[11px] font-bold tracking-[0.1em] uppercase [font-stretch:85%] disabled:cursor-default",
            i > 0 && "border-l-2 border-chalk/90",
            value === v
              ? v === "won"
                ? "bg-canvas text-chalk"
                : v === "lost"
                  ? "bg-ink/80 text-chalk-dim"
                  : "bg-chalk text-ink"
              : "hover:bg-chalk/10",
            disabled && value !== v && "opacity-50",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/* 4b. Synchronisation ------------------------------------------------ */

type SyncRun = {
  id: number
  at: string
  kind: "results" | "draw"
  ok: boolean
  matches: number
  updated: number
  api_calls: number
  error: string | null
  unmatched: string[]
}

function SyncSection({ data, onChanged }: Props) {
  const [runs, setRuns] = useState<SyncRun[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadRuns = useCallback(async () => {
    const { data: rows, error } = await supabase
      .from("sync_runs")
      .select("id, at, kind, ok, matches, updated, api_calls, error, unmatched")
      .eq("tournament_id", data.t.id)
      .order("at", { ascending: false })
      .limit(5)
    if (error) setError(error.message)
    else setRuns(rows as SyncRun[])
  }, [data.t.id])

  useEffect(() => {
    loadRuns()
  }, [loadRuns])

  async function syncNow() {
    setBusy(true)
    setMsg(null)
    setError(null)
    const { data: res, error } = await supabase.functions.invoke("sync-results", { body: { tournament_id: data.t.id } })
    const run = res?.runs?.[0] as SyncRun | undefined
    // Non-2xx: the function's {error} is in the response body.
    const body = error?.context instanceof Response ? await error.context.json().catch(() => null) : null
    if (error) setError(body?.error ?? error.message)
    else if (!run) setError("Aucun tournoi synchronisé (identifiant API manquant ?)")
    else if (run.error) setError(run.error)
    else setMsg(`${run.matches} matchs lus, ${run.updated} résultats mis à jour`)
    await Promise.all([loadRuns(), onChanged()])
    setBusy(false)
  }

  return (
    <Section title="Synchronisation">
      <NextSync t={data.t} />
      <p className="mb-3 text-sm text-chalk/85">
        {data.t.external_id ? `Identifiant API : ${data.t.external_id}` : "Aucun identifiant API : la synchronisation est inactive."}
      </p>
      <ChalkButton onClick={syncNow} disabled={busy || !data.t.external_id} className="w-full">
        {busy ? "Synchronisation…" : "Synchroniser maintenant"}
      </ChalkButton>
      {msg && <p className="mt-3 text-sm font-medium">{msg}</p>}
      {error && <div className="mt-3"><ErrorBox message={error} /></div>}
      <ul className="mt-4 space-y-2 text-sm">
        {runs.map((r) => (
          <li key={r.id} className="border-t-2 border-chalk/40 pt-2 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-chalk/75">{formatDate(r.at, true)}</span>
              <Tag tone={r.ok ? "alive" : "out"}>{r.ok ? "OK" : "Erreur"}</Tag>
            </div>
            <div className="mt-1 text-xs tabular-nums">
              {r.kind === "draw"
                ? `Tableau · ${r.updated} joueur(s) ajouté(s)`
                : `${r.matches} matchs · ${r.updated} mis à jour`}{" "}
              · {r.api_calls} appel(s) API
            </div>
            {r.error && <div className="mt-1 text-xs text-chalk/85">{r.error}</div>}
            {r.unmatched.length > 0 && (
              <div className="mt-1 text-xs text-chalk/85">Non reconnus : {r.unmatched.join(", ")}</div>
            )}
          </li>
        ))}
        {runs.length === 0 && <li className="text-chalk/80">Aucune synchronisation.</li>}
      </ul>
    </Section>
  )
}

/**
 * Cron checks hourly at :00 ('0 * * * *', UTC). See scheduledRun in the sync-results Edge Function: results only
 * while a match is due (or every 6 h), draws in the 3 days before the first lock, status follows the calendar.
 */
function NextSync({ t }: { t: Tournament }) {
  const now = useNow(10_000)
  const hour = 60 * 60_000
  const next = Math.floor(now / hour) * hour + hour
  const paused = !t.external_id
    ? "pas d'ID Tennis API"
    : t.status === "draft" || t.status === "finished"
      ? "tournoi pas en cours"
      : null
  return (
    <div className="mb-2 space-y-1 text-sm">
      {paused ? (
        <p>Synchro auto en pause ({paused})</p>
      ) : (
        <>
          <p>
            Prochaine vérification : <strong className="tabular-nums">{formatTime(next)}</strong> (dans{" "}
            {Math.ceil((next - now) / 60_000)} min)
          </p>
          <p className="text-chalk/85">
            {t.status === "registration"
              ? "Import auto du tableau dès sa publication (3 jours avant le 1er tour), puis passage « En cours » au verrouillage."
              : "Résultats synchronisés quand un match est prévu ou en cours (au moins toutes les 6 h), dans la limite de 45 appels API par jour."}
          </p>
        </>
      )}
    </div>
  )
}

/* 5. Inscrits --------------------------------------------------------- */

function EntriesSection({ data, onChanged }: Props) {
  const { busy, error, run } = useWrite(onChanged)
  const [editing, setEditing] = useState<string | null>(null)
  const [roundId, setRoundId] = useState("")
  const [playerId, setPlayerId] = useState("")
  const statusOf = new Map(data.statuses.map((s) => [s.entry_id, s]))
  const roundName = (idx: number | null) => data.rounds.find((r) => r.idx === idx)?.name ?? ""
  const hasPick = (entryId: string, roundId: string) => data.picks.some((p) => p.entry_id === entryId && p.round_id === roundId)
  /** The round an entry went out in for lack of a pick (the one a waiver can rescue). */
  const missedRound = (entryId: string) => {
    const r = data.rounds.find((x) => x.idx === statusOf.get(entryId)?.eliminated_round)
    return r && !hasPick(entryId, r.id) ? r : undefined
  }
  const waiversOf = (entryId: string) =>
    data.waivers.filter((w) => w.entry_id === entryId).map((w) => data.rounds.find((r) => r.id === w.round_id)!).filter(Boolean)

  function waive(e: EntryRow, round: Round, waived: boolean) {
    const who = displayName(e.profiles)
    const ask = waived
      ? `Repêcher ${who} au ${round.name} ? Son absence de choix ne l'élimine plus.`
      : `Annuler le repêchage de ${who} au ${round.name} ? Sans choix, il sera de nouveau éliminé.`
    if (!confirm(ask)) return
    return run(`waive:${e.id}`, () =>
      supabase.rpc("admin_waive_round", { p_entry_id: e.id, p_round_id: round.id, p_waived: waived }),
    )
  }

  function openPick(entryId: string) {
    const r = data.rounds.find((x) => new Date(x.locks_at).getTime() > Date.now()) ?? data.rounds[0]
    setEditing(editing === entryId ? null : entryId)
    setRoundId(r?.id ?? "")
    setPlayerId(data.picks.find((p) => p.entry_id === entryId && p.round_id === r?.id)?.player_id ?? "")
  }

  function remove(e: EntryRow) {
    if (!confirm(`Retirer l'inscription de ${displayName(e.profiles)} ? Ses choix seront supprimés.`)) return
    return run(e.id, () => supabase.rpc("admin_remove_entry", { p_entry_id: e.id }))
  }

  async function savePick(entryId: string) {
    const ok = await run(`pick:${entryId}`, () =>
      supabase.rpc("admin_set_pick", { p_entry_id: entryId, p_round_id: roundId, p_player_id: playerId }),
    )
    if (ok) setEditing(null)
  }

  return (
    <Section title={`Inscrits · ${data.entries.length}`}>
      {error && <div className="mb-3"><ErrorBox message={error} /></div>}
      <ul className="space-y-0">
        {data.entries.map((e) => {
          const s = statusOf.get(e.id)
          const missed = missedRound(e.id)
          const waived = waiversOf(e.id)
          return (
            <li key={e.id} className="border-t-2 border-chalk/40 py-3 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{displayName(e.profiles)}</span>
                {s && !s.alive ? (
                  <Tag tone="out">Éliminé · {roundName(s.eliminated_round)}</Tag>
                ) : (
                  <Tag tone="alive">En vie</Tag>
                )}
                <button onClick={() => openPick(e.id)} className="text-xs font-bold underline underline-offset-4">
                  Choix
                </button>
                <button
                  onClick={() => remove(e)}
                  disabled={!!busy}
                  className="text-xs font-bold underline underline-offset-4 disabled:opacity-50"
                >
                  Retirer
                </button>
              </div>
              {(missed || waived.length > 0) && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {missed && (
                    <>
                      <span className="text-chalk/85">Aucun choix au {missed.name}</span>
                      <button
                        onClick={() => waive(e, missed, true)}
                        disabled={!!busy}
                        className="font-bold underline underline-offset-4 disabled:opacity-50"
                      >
                        Repêcher
                      </button>
                    </>
                  )}
                  {waived.map((r) => (
                    <span key={r.id} className="inline-flex items-center gap-2">
                      <Tag tone="neutral">Repêché · {r.name}</Tag>
                      <button
                        onClick={() => waive(e, r, false)}
                        disabled={!!busy}
                        className="font-bold underline underline-offset-4 disabled:opacity-50"
                      >
                        Annuler
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {editing === e.id && (
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <select
                    aria-label="Tour"
                    className={selectClass}
                    value={roundId}
                    onChange={(ev) => {
                      setRoundId(ev.target.value)
                      setPlayerId(data.picks.find((p) => p.entry_id === e.id && p.round_id === ev.target.value)?.player_id ?? "")
                    }}
                  >
                    {data.rounds.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <select aria-label="Joueur" className={selectClass} value={playerId} onChange={(ev) => setPlayerId(ev.target.value)}>
                    <option value="">Choisir un joueur</option>
                    {data.players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.seed ? `[${p.seed}] ` : ""}
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <LineButton onClick={() => savePick(e.id)} disabled={!roundId || !playerId || !!busy}>
                    Valider
                  </LineButton>
                </div>
              )}
            </li>
          )
        })}
        {data.entries.length === 0 && <li className="text-sm text-chalk/80">Aucun inscrit.</li>}
      </ul>
    </Section>
  )
}

/* 6. Journal ---------------------------------------------------------- */

function LogSection({ data }: { data: Data }) {
  return (
    <Section title="Journal · 50 dernières actions">
      <ul className="space-y-2 text-sm">
        {data.log.map((l) => (
          <li key={l.id} className="border-t-2 border-chalk/40 pt-2 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-bold">{l.action}</span>
              <span className="text-xs text-chalk/75">
                {formatDate(l.at, true)} · {l.profiles?.username ?? "?"}
              </span>
            </div>
            <code className="mt-1 block truncate font-mono text-[11px] text-chalk/80">{JSON.stringify(l.payload)}</code>
          </li>
        ))}
        {data.log.length === 0 && <li className="text-chalk/80">Aucune action.</li>}
      </ul>
    </Section>
  )
}
