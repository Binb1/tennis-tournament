// Edge Function sync-results: pulls the singles draw from "Tennis API - ATP WTA ITF" (RapidAPI)
// into matches (bracket, opponents, scores) and player_results (won/lost).
// Body {tournament_id, action: "import_draw"} (admin only) imports the main-draw players, their country and ranking.
// API calls: sync = 1 per live tournament (draws; results endpoint only as fallback), import = 2 (draws + rankings).
// Called by pg_cron every hour (header x-cron-secret) or by an admin from the admin page (user JWT).
// Hourly run: status follows the calendar (advance_tournaments), draws import themselves in the 3 days before the
// first lock, results sync only while matches are due, and every call counts against a rolling 24 h budget.
// Secrets (Edge Function secrets): TENNIS_API_KEY, CRON_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2"
import {
  type ApiMatch, type Side, type Slot, drawResults, parseDraw, parseDrawMatches, parseRankings, parseResults,
} from "./parse.ts"

const API_HOST = "tennis-api-atp-wta-itf.p.rapidapi.com"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

type Tournament = { id: string; external_id: string; tour: string; starts_at: string | null }
type Candidate = Tournament & { status: string; draw_size: number; players: { count: number }[] }

const HOUR = 3600_000
const SLACK = 5 * 60_000 // cron runs drift by a few seconds: "every 6 h" must not slip to 7 h
/** Calls allowed over any 24 h window (the RapidAPI plan allows 50/day; admin clicks count too). */
const BUDGET = 45
// deno-lint-ignore no-explicit-any
type Db = any

/** API key + calls spent by the current run (stored in sync_runs.api_calls). */
type Api = { key: string; calls: number }

/** GET https://<host>/tennis/v2/<path>. */
async function api(c: Api, path: string) {
  c.calls++
  const res = await fetch(`https://${API_HOST}/tennis/v2/${path}`, {
    headers: { "x-rapidapi-key": c.key, "x-rapidapi-host": API_HOST },
  })
  if (!res.ok) throw new Error(`Tennis API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()

/** Full singles draw (all main rounds, bracket slots, results). Path order: tournament/{tour}/{id}/{year}/draws. */
const fetchDraw = (c: Api, t: Tournament) =>
  api(c, `tournament/${t.tour.toLowerCase()}/${t.external_id}/${new Date(t.starts_at ?? Date.now()).getUTCFullYear()}/draws?includeAll=true`)

/** Player lookup: API id first, then normalized name. */
function playerFinder(players: { id: string; name: string; external_id: string | null }[]) {
  const byExt = new Map(players.filter((p) => p.external_id).map((p) => [String(p.external_id), p.id]))
  const byName = new Map(players.map((p) => [norm(p.name), p.id]))
  return (s: Side | null): string | null => (s ? byExt.get(s.external_id) ?? byName.get(norm(s.name)) ?? null : null)
}

/** Upserts one matches row per bracket slot (key: tournament + "<roundId>-<slot>"). Returns the parsed slots. */
async function upsertMatches(db: Db, t: Tournament, draw: unknown): Promise<Slot[]> {
  const [{ data: players }, { data: rounds }] = await Promise.all([
    db.from("players").select("id, name, external_id").eq("tournament_id", t.id),
    db.from("rounds").select("id, idx").eq("tournament_id", t.id),
  ])
  const find = playerFinder(players ?? [])
  const roundByIdx = new Map((rounds ?? []).map((r: Db) => [r.idx, r.id]))
  const slots = parseDrawMatches(draw, (rounds ?? []).length)
  // The API can list a slot twice (e.g. byes in 96/56 draws): keep one row per slot, a finished match first.
  const bySlot = new Map<string, Slot>()
  for (const s of slots) {
    if (s.position == null) continue // bye entries without a slot
    if (bySlot.get(s.external_id)?.status !== "done") bySlot.set(s.external_id, s)
  }
  const rows = [...bySlot.values()].filter((s) => roundByIdx.has(s.round_idx)).map((s) => ({
    tournament_id: t.id,
    round_id: roundByIdx.get(s.round_idx),
    external_id: s.external_id,
    player1_id: find(s.player1),
    player2_id: find(s.player2),
    winner_id: find(s.winner),
    scheduled_at: s.scheduled_at,
    score: s.score,
    status: s.status,
    position: s.position,
    updated_at: new Date().toISOString(),
  }))
  if (rows.length) {
    const { error } = await db.from("matches").upsert(rows, { onConflict: "tournament_id,external_id" })
    if (error) throw new Error(error.message)
  }
  return slots
}

/** Admin "import draw": fetch the draw (fixtures + results as fallback), then storeDraw. */
async function importDraw(db: Db, c: Api, tournamentId: string) {
  const { data: t, error } = await db.from("tournaments").select("id, external_id, tour, starts_at").eq("id", tournamentId).single()
  if (error || !t?.external_id) return json({ error: error?.message ?? "ID Tennis API manquant" }, 400)
  const run = { tournament_id: t.id, kind: "draw", ok: false, updated: 0, error: null as string | null }
  try {
    const tour = t.tour.toLowerCase()
    // Draws (all rounds, slots, seeds, countries); fixtures + results only if it fails or is empty.
    const d = await fetchDraw(c, t).catch((e) => (console.error("draws failed, fallback:", e), null))
    const draw = d?.singles?.length ? d : null
    const sources = draw ? [draw] : [
      await api(c, `${tour}/fixtures/tournament/${t.external_id}`),
      await api(c, `${tour}/tournament/results/${t.external_id}`).catch(() => null), // none yet = fine
    ]
    const res = await storeDraw(db, c, t, sources, draw)
    Object.assign(run, { ok: true, updated: res.inserted })
    return json(res)
  } catch (e) {
    run.error = e instanceof Error ? e.message : String(e)
    return json({ error: run.error }, 500)
  } finally {
    await db.from("sync_runs").insert({ ...run, api_calls: c.calls })
  }
}

/**
 * Inserts the main-draw players not yet in the tournament (matched by external_id or name), sets country and
 * world ranking on all of them (seed only when empty), then stores the matches. 1 API call (rankings).
 */
async function storeDraw(db: Db, c: Api, t: Tournament, sources: unknown[], draw: unknown | null) {
  const ranks = parseRankings(await api(c, `${t.tour.toLowerCase()}/ranking/singles?pageSize=500`).catch(() => null))

  const { data: players } = await db.from("players").select("id, name, seed, external_id").eq("tournament_id", t.id)
  const find = playerFinder(players ?? [])
  const current = new Map((players ?? []).map((p: Db) => [p.id, p]))
  const rows = []
  const updates = []
  for (const p of parseDraw(...sources)) {
    const ranking = ranks.get(p.external_id) ?? null
    const id = find(p)
    if (!id) {
      rows.push({ tournament_id: t.id, name: p.name, seed: p.seed, external_id: p.external_id, country: p.country, ranking })
      continue
    }
    const cur: Db = current.get(id)
    updates.push(
      db.from("players").update({
        country: p.country,
        ...(ranks.size ? { ranking } : {}), // rankings call failed: keep the old value
        seed: cur.seed ?? p.seed,
        external_id: cur.external_id ?? p.external_id,
      }).eq("id", id),
    )
  }
  if (rows.length) {
    const { error: insErr } = await db.from("players").insert(rows)
    if (insErr) throw new Error(insErr.message)
  }
  for (const r of await Promise.all(updates)) if (r.error) throw new Error(r.error.message)
  if (draw) await upsertMatches(db, t, draw)
  return { inserted: rows.length, updated: updates.length }
}

/** Results of one live tournament: bracket (matches) + player_results. 1 API call (2 when the draw fails). */
async function syncResults(db: Db, c: Api, t: Tournament) {
  const run = { tournament_id: t.id, kind: "results", ok: false, matches: 0, updated: 0, error: null as string | null, unmatched: [] as string[] }
  try {
    const [{ data: players }, { data: rounds }] = await Promise.all([
      db.from("players").select("id, name, external_id").eq("tournament_id", t.id),
      db.from("rounds").select("id, idx").eq("tournament_id", t.id),
    ])
    // Draws: 1 call for both matches and player_results. Results endpoint only if draws fails.
    const d = await fetchDraw(c, t).catch((e) => (console.error("draws failed, fallback:", e), null))
    const draw = d?.singles?.length ? d : null
    const matches: ApiMatch[] = draw
      ? drawResults(await upsertMatches(db, t, draw))
      : parseResults(await api(c, `${t.tour.toLowerCase()}/tournament/results/${t.external_id}`), (rounds ?? []).length)
    run.matches = matches.length

    const findPlayer = playerFinder(players ?? [])
    const roundByIdx = new Map((rounds ?? []).map((r: Db) => [r.idx, r.id]))

    const { data: existing } = await db
      .from("player_results").select("player_id, round_id, source")
      .in("round_id", (rounds ?? []).map((r: Db) => r.id))
    const manual = new Set((existing ?? []).filter((e: Db) => e.source === "manual").map((e: Db) => `${e.player_id}:${e.round_id}`))

    const rows = new Map<string, Record<string, unknown>>() // dedup: one row per player+round
    const unmatched = new Set<string>()
    for (const m of matches) {
      const roundId = roundByIdx.get(m.round_idx)
      if (!roundId) continue
      for (const [side, result] of [[m.winner, "won"], [m.loser, "lost"]] as const) {
        if (!side) continue // inferred walkover: no opponent
        const playerId = findPlayer(side)
        if (!playerId) {
          unmatched.add(side.name)
          continue
        }
        const key = `${playerId}:${roundId}`
        if (manual.has(key)) continue // never overwrite the admin
        rows.set(key, {
          player_id: playerId,
          round_id: roundId,
          result,
          status: "done",
          source: "api",
          updated_at: new Date().toISOString(),
        })
      }
    }
    if (rows.size) {
      const { error: upErr } = await db.from("player_results").upsert([...rows.values()], { onConflict: "player_id,round_id" })
      if (upErr) throw new Error(upErr.message)
    }
    run.updated = rows.size
    run.unmatched = [...unmatched]
    run.ok = true
  } catch (e) {
    run.error = e instanceof Error ? e.message : String(e)
  }
  await db.from("sync_runs").insert({ ...run, api_calls: c.calls })
  return run
}

/**
 * Hourly cron run. Status moves first (registration -> live at the first lock), then within the budget:
 * - results of each live tournament, only while a match is due (start time passed, not finished) or every 6 h to
 *   pick up the next order of play; several live tournaments share the budget (each at most every n*24/40 h);
 * - draws in the 3 days before the first lock, every 6 h (2 h in the last 12 h), imported once complete
 *   (or partial in the last 12 h: qualifiers fill in on the next checks).
 * Status moves again at the end (live -> finished once the final is won).
 */
async function scheduledRun(db: Db, key: string) {
  await db.rpc("advance_tournaments")
  const now = Date.now()
  const [{ data: ts, error }, { data: runs }] = await Promise.all([
    db.from("tournaments").select("id, external_id, tour, starts_at, status, draw_size, players(count)")
      .not("external_id", "is", null).in("status", ["registration", "live"]),
    db.from("sync_runs").select("tournament_id, at, kind, api_calls").gte("at", new Date(now - 24 * HOUR).toISOString()),
  ])
  if (error) throw new Error(error.message)
  let left = BUDGET - (runs ?? []).reduce((n: number, r: Db) => n + r.api_calls, 0)
  const lastRun = (id: string, kind: string) =>
    Math.max(0, ...(runs ?? []).filter((r: Db) => r.tournament_id === id && r.kind === kind).map((r: Db) => Date.parse(r.at)))
  const summary = []

  const live = (ts ?? []).filter((t: Candidate) => t.status === "live") as Candidate[]
  const { data: due } = live.length
    ? await db.from("matches").select("tournament_id").in("tournament_id", live.map((t) => t.id))
      .neq("status", "done").lte("scheduled_at", new Date(now).toISOString())
    : { data: [] }
  const dueIds = new Set((due ?? []).map((m: Db) => m.tournament_id))
  const gap = Math.max(1, Math.ceil((live.length * 24) / 40)) * HOUR - SLACK
  for (const t of live.sort((a, b) => lastRun(a.id, "results") - lastRun(b.id, "results"))) {
    const since = now - lastRun(t.id, "results")
    if (since < gap || (!dueIds.has(t.id) && since < 6 * HOUR - SLACK)) continue
    if (left < 1) break
    const c = { key, calls: 0 }
    summary.push(await syncResults(db, c, t))
    left -= c.calls
  }

  const waiting = ((ts ?? []) as Candidate[]).filter((t) =>
    t.status === "registration" && t.starts_at && Date.parse(t.starts_at) - now <= 72 * HOUR &&
    (t.players[0]?.count ?? 0) < t.draw_size
  )
  for (const t of waiting) {
    const toLock = Date.parse(t.starts_at!) - now
    if (now - lastRun(t.id, "draw") < (toLock < 12 * HOUR ? 2 : 6) * HOUR - SLACK) continue
    if (left < 2) break
    const c = { key, calls: 0 }
    const run = { tournament_id: t.id, kind: "draw", ok: false, updated: 0, error: null as string | null }
    try {
      const d = await fetchDraw(c, t)
      const found = d?.singles?.length ? parseDraw(d).length : 0
      if (found >= t.draw_size || (found > 0 && toLock < 12 * HOUR)) run.updated = (await storeDraw(db, c, t, [d], d)).inserted
      run.ok = true
    } catch (e) {
      run.error = e instanceof Error ? e.message : String(e)
    }
    await db.from("sync_runs").insert({ ...run, api_calls: c.calls })
    summary.push(run)
    left -= c.calls
  }

  await db.rpc("advance_tournaments")
  return { runs: summary, budget_left: left }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  const url = Deno.env.get("SUPABASE_URL")!
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

  // Auth: cron secret, or an admin user.
  const cronSecret = Deno.env.get("CRON_SECRET")
  const isCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret
  if (!isCron) {
    const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    })
    const { data: isAdmin } = await user.rpc("is_admin")
    if (!isAdmin) return json({ error: "Non autorisé" }, 401)
  }

  const apiKey = Deno.env.get("TENNIS_API_KEY")
  if (!apiKey) return json({ error: "Secret TENNIS_API_KEY manquant" }, 500)

  const body = await req.json().catch(() => ({}))
  if (body.action === "import_draw") {
    if (isCron || !body.tournament_id) return json({ error: "Requête invalide" }, 400)
    return importDraw(db, { key: apiKey, calls: 0 }, body.tournament_id)
  }
  // Admin "sync now" on one tournament; otherwise (cron, or admin without a tournament) the scheduled run.
  if (body.tournament_id) {
    const { data: t, error } = await db.from("tournaments").select("id, external_id, tour, starts_at").eq("id", body.tournament_id).single()
    if (error || !t?.external_id) return json({ error: error?.message ?? "ID Tennis API manquant" }, 400)
    const run = await syncResults(db, { key: apiKey, calls: 0 }, t)
    return json({ tournaments: 1, runs: [run] })
  }
  try {
    return json(await scheduledRun(db, apiKey))
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
