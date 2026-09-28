// Edge Function sync-results: pulls finished singles matches from "Tennis API - ATP WTA ITF" (RapidAPI)
// into player_results. Body {tournament_id, action: "import_draw"} (admin only) imports the main-draw players.
// Called by pg_cron (header x-cron-secret) or by an admin from the admin page (user JWT).
// Secrets (Edge Function secrets): TENNIS_API_KEY, CRON_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2"
import { type ApiMatch, type Side, parseDraw, parseResults } from "./parse.ts"

const API_HOST = "tennis-api-atp-wta-itf.p.rapidapi.com"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

type Tournament = { id: string; external_id: string; tour: string }
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

/** Inserts the main-draw players not yet in the tournament (matched by external_id or name). */
async function importDraw(db: Db, key: string, tournamentId: string) {
  const { data: t, error } = await db.from("tournaments").select("id, external_id, tour").eq("id", tournamentId).single()
  if (error || !t?.external_id) return json({ error: error?.message ?? "ID Tennis API manquant" }, 400)
  try {
    const tour = t.tour.toLowerCase()
    const fixtures = await api(key, `${tour}/fixtures/tournament/${t.external_id}`)
    // Results cover the first-round matches already played (absent from fixtures). None yet = fine.
    const results = await api(key, `${tour}/tournament/results/${t.external_id}`).catch(() => null)

    const { data: players } = await db.from("players").select("name, external_id").eq("tournament_id", t.id)
    const seen = new Set<string>()
    for (const p of players ?? []) {
      seen.add(norm(p.name))
      if (p.external_id) seen.add(`id:${p.external_id}`)
    }
    const rows = []
    for (const p of parseDraw(fixtures, results)) {
      if (seen.has(`id:${p.external_id}`) || seen.has(norm(p.name))) continue
      seen.add(`id:${p.external_id}`).add(norm(p.name))
      rows.push({ tournament_id: t.id, name: p.name, seed: p.seed, external_id: p.external_id })
    }
    if (rows.length) {
      const { error: insErr } = await db.from("players").insert(rows)
      if (insErr) throw new Error(insErr.message)
    }
    return json({ inserted: rows.length })
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
  let q = db.from("tournaments").select("id, external_id, tour").not("external_id", "is", null)
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
      const body = await api(apiKey, `${t.tour.toLowerCase()}/tournament/results/${t.external_id}`)
      const matches: ApiMatch[] = parseResults(body, (rounds ?? []).length)
      run.matches = matches.length

      const byExt = new Map((players ?? []).filter((p: Db) => p.external_id).map((p: Db) => [String(p.external_id), p.id]))
      const byName = new Map((players ?? []).map((p: Db) => [norm(p.name), p.id]))
      const findPlayer = (s: Side) => byExt.get(s.external_id) ?? byName.get(norm(s.name))
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
