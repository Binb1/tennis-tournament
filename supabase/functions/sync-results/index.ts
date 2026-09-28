// Edge Function sync-results: pulls the singles draw from "Tennis API - ATP WTA ITF" (RapidAPI)
// into matches (bracket, opponents, scores) and player_results (won/lost).
// Body {tournament_id, action: "import_draw"} (admin only) imports the main-draw players, their country and ranking.
// API calls: sync = 1 per live tournament (draws; results endpoint only as fallback), import = 2 (draws + rankings).
// Called by pg_cron (header x-cron-secret) or by an admin from the admin page (user JWT).
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
// deno-lint-ignore no-explicit-any
type Db = any

/** GET https://<host>/tennis/v2/<path>. */
async function api(key: string, path: string) {
  const res = await fetch(`https://${API_HOST}/tennis/v2/${path}`, {
    headers: { "x-rapidapi-key": key, "x-rapidapi-host": API_HOST },
  })
  if (!res.ok) throw new Error(`Tennis API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()

/** Full singles draw (all main rounds, bracket slots, results). Path order: tournament/{tour}/{id}/{year}/draws. */
const fetchDraw = (key: string, t: Tournament) =>
  api(key, `tournament/${t.tour.toLowerCase()}/${t.external_id}/${new Date(t.starts_at ?? Date.now()).getUTCFullYear()}/draws?includeAll=true`)

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
  const rows = slots.filter((s) => roundByIdx.has(s.round_idx)).map((s) => ({
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

/**
 * Inserts the main-draw players not yet in the tournament (matched by external_id or name), sets country and
 * world ranking on all of them (seed only when empty), then stores the matches.
 */
async function importDraw(db: Db, key: string, tournamentId: string) {
  const { data: t, error } = await db.from("tournaments").select("id, external_id, tour, starts_at").eq("id", tournamentId).single()
  if (error || !t?.external_id) return json({ error: error?.message ?? "ID Tennis API manquant" }, 400)
  try {
    const tour = t.tour.toLowerCase()
    // Draws (all rounds, slots, seeds, countries); fixtures + results only if it fails or is empty.
    const d = await fetchDraw(key, t).catch((e) => (console.error("draws failed, fallback:", e), null))
    const draw = d?.singles?.length ? d : null
    const sources = draw ? [draw] : [
      await api(key, `${tour}/fixtures/tournament/${t.external_id}`),
      await api(key, `${tour}/tournament/results/${t.external_id}`).catch(() => null), // none yet = fine
    ]
    const ranks = parseRankings(await api(key, `${tour}/ranking/singles?pageSize=500`).catch(() => null))

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
    return json({ inserted: rows.length, updated: updates.length })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
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
    return importDraw(db, apiKey, body.tournament_id)
  }
  let q = db.from("tournaments").select("id, external_id, tour, starts_at").not("external_id", "is", null)
  q = body.tournament_id ? q.eq("id", body.tournament_id) : q.eq("status", "live")
  const { data: tournaments, error } = await q
  if (error) return json({ error: error.message }, 500)

  const summary = []
  for (const t of (tournaments ?? []) as Tournament[]) {
    const run = { tournament_id: t.id, ok: false, matches: 0, updated: 0, error: null as string | null, unmatched: [] as string[] }
    try {
      const [{ data: players }, { data: rounds }] = await Promise.all([
        db.from("players").select("id, name, external_id").eq("tournament_id", t.id),
        db.from("rounds").select("id, idx").eq("tournament_id", t.id),
      ])
      // Draws: 1 call for both matches and player_results. Results endpoint only if draws fails.
      const d = await fetchDraw(apiKey, t).catch((e) => (console.error("draws failed, fallback:", e), null))
      const draw = d?.singles?.length ? d : null
      const matches: ApiMatch[] = draw
        ? drawResults(await upsertMatches(db, t, draw))
        : parseResults(await api(apiKey, `${t.tour.toLowerCase()}/tournament/results/${t.external_id}`), (rounds ?? []).length)
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
    await db.from("sync_runs").insert(run)
    summary.push(run)
  }
  return json({ tournaments: summary.length, runs: summary })
})
