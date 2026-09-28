// Pure parsing of "Tennis API - ATP WTA ITF" (RapidAPI) payloads. No imports, so node can test it.
//
// API roundIds (seen on French Open 2026 and China Open 2026):
//   1-3 = qualifying, 4 = 1st main round, 5 = 2nd, 6 = 3rd, 7 = 4th, 9 = QF, 10 = SF, 12 = F.
// roundId 4 is the FIRST main round whatever the draw size (China Open, 32 draw: seed 1 plays in 4),
// so early rounds count from the bottom and QF/SF/F from the top.

export type Side = { name: string; external_id: string }
export type ApiMatch = { round_idx: number; winner: Side; loser: Side | null } // loser null = inferred walkover
// deno-lint-ignore no-explicit-any
type Raw = any

export const MAIN_FIRST_ROUND = 4

/** API roundId -> our round idx (1..n), or null when outside the tournament. */
export function roundIdx(apiRound: number, n: number): number | null {
  const top: Record<number, number> = { 12: n, 10: n - 1, 9: n - 2 }
  const idx = top[apiRound] ?? (apiRound >= MAIN_FIRST_ROUND && apiRound <= 8 ? apiRound - 3 : null)
  if (idx == null || idx < 1 || idx > n) return null
  if (!(apiRound in top) && idx >= n - 2) return null // early round colliding with QF/SF/F: ignore
  return idx
}

const PLACEHOLDER = /^(tbd|qualifier|bye|unknown)\b/i // "Unknown Player" (id 3700) = qualifier not known yet
const side = (p: Raw): Side | null =>
  p?.id != null && p?.name && !PLACEHOLDER.test(p.name) ? { name: String(p.name), external_id: String(p.id) } : null

/** Finished singles matches from GET {tour}/tournament/results/{id}, plus inferred walkover wins. */
export function parseResults(body: Raw, n: number): ApiMatch[] {
  const out: ApiMatch[] = []
  for (const m of body?.data?.singles ?? []) {
    const idx = roundIdx(Number(m.roundId), n)
    const a = side(m.player1), b = side(m.player2)
    if (!idx || !a || !b || m.match_winner == null) continue
    if (!["completed", "retired", "walkover"].includes(String(m.result_type))) continue
    const aWon = String(m.match_winner) === a.external_id
    out.push({ round_idx: idx, winner: aWon ? a : b, loser: aWon ? b : a })
  }
  return [...out, ...inferWalkovers(out)]
}

/** A player seen in round k but with no match in round k-1 won k-1 (walkovers are missing from the API). */
export function inferWalkovers(matches: ApiMatch[]): ApiMatch[] {
  const seen = new Map<string, Side>() // "id:idx" -> player
  for (const m of matches) for (const s of [m.winner, m.loser]) if (s) seen.set(`${s.external_id}:${m.round_idx}`, s)
  const out: ApiMatch[] = []
  for (const [key, s] of seen) {
    const idx = Number(key.split(":")[1])
    if (idx > 1 && !seen.has(`${s.external_id}:${idx - 1}`)) out.push({ round_idx: idx - 1, winner: s, loser: null })
  }
  return out
}

export type DrawPlayer = { name: string; external_id: string; seed: number | null; country: string | null }

/** Singles matches of any payload: draws {singles}, results {data: {singles}}, fixtures {data: []}. */
const singles = (body: Raw): Raw[] =>
  Array.isArray(body?.data) ? body.data : body?.data?.singles ?? body?.singles ?? []

/** "7WC" -> 7, "WC"/"q"/null -> null. */
const seedOf = (seed: unknown) => parseInt(String(seed)) || null
const country = (p: Raw) => (/^[A-Z]{3}$/.test(p?.countryAcr ?? "") ? p.countryAcr : null)

/**
 * Main-draw players: everyone in a main-round match (roundId >= 4) of the given payloads
 * (draws, or fixtures + results). All main rounds, so seeds with a bye and players whose R1 is played are included.
 */
export function parseDraw(...bodies: Raw[]): DrawPlayer[] {
  const byId = new Map<string, DrawPlayer>()
  const add = (p: Raw, seed: unknown) => {
    const s = side(p)
    if (!s) return
    const cur = byId.get(s.external_id)
    if (cur) {
      cur.seed ??= seedOf(seed)
      cur.country ??= country(p)
    } else byId.set(s.external_id, { ...s, seed: seedOf(seed), country: country(p) })
  }
  for (const m of bodies.flatMap(singles)) {
    if (Number(m.roundId) < MAIN_FIRST_ROUND) continue
    add(m.player1, m.seed1)
    add(m.player2, m.seed2)
  }
  return [...byId.values()]
}

export type Slot = {
  external_id: string // "<api roundId>-<draw slot>"
  round_idx: number
  position: number | null // bracket slot in the round, 1 = top; slot p is fed by 2p-1 and 2p
  player1: Side | null
  player2: Side | null
  winner: Side | null
  score: string | null
  status: "scheduled" | "live" | "done"
  scheduled_at: string | null
}

/**
 * Main-round matches of GET {tour}/tournament/{id}/{year}/draws. Later rounds appear once both players are known.
 * A finished match has a non-empty result, and its player1 is the winner (checked on all 124 French Open 2026
 * matches against the results endpoint's match_winner). Walkovers are present, with result "w/o".
 */
export function parseDrawMatches(body: Raw, n: number): Slot[] {
  const out: Slot[] = []
  for (const m of body?.singles ?? []) {
    const idx = roundIdx(Number(m.roundId), n)
    if (!idx) continue
    const position = Number(m.draw) > 0 ? Number(m.draw) : null
    const player1 = side(m.player1), player2 = side(m.player2)
    const score = m.result ? String(m.result) : null
    const status = score ? "done" : m.live ? "live" : "scheduled"
    out.push({
      external_id: `${m.roundId}-${position ?? `${m.player1Id}-${m.player2Id}`}`,
      round_idx: idx,
      position,
      player1,
      player2,
      winner: status === "done" ? player1 : null,
      score,
      status,
      scheduled_at: m.startTime ?? m.date ?? null,
    })
  }
  return out
}

/** Finished draw matches in the parseResults shape (for player_results), plus inferred walkovers. */
export function drawResults(slots: Slot[]): ApiMatch[] {
  const out: ApiMatch[] = []
  for (const s of slots) {
    if (s.status !== "done" || !s.player1) continue
    out.push({ round_idx: s.round_idx, winner: s.player1, loser: s.player2 })
  }
  return [...out, ...inferWalkovers(out)]
}

/** GET {tour}/ranking/singles?pageSize=500 -> Map(player external_id -> rank). */
export function parseRankings(body: Raw): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of body?.data ?? []) if (r?.player?.id != null && r.position > 0) out.set(String(r.player.id), Number(r.position))
  return out
}
