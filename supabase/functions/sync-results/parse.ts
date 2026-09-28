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

const side = (p: Raw): Side | null =>
  p?.id != null && p?.name ? { name: String(p.name), external_id: String(p.id) } : null

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

export type DrawPlayer = { name: string; external_id: string; seed: number | null }

/**
 * Main-draw players: everyone in a main-round match (roundId >= 4) of the fixtures and of the results.
 * All main rounds, not only the first, so seeds with a bye and players whose R1 is already played are included.
 */
export function parseDraw(fixtures: Raw, results: Raw): DrawPlayer[] {
  const byId = new Map<string, DrawPlayer>()
  const add = (p: Raw, seed: unknown) => {
    const s = side(p)
    if (!s || /^(tbd|qualifier|bye)\b/i.test(s.name)) return
    const seedNum = Number(seed) || null
    const cur = byId.get(s.external_id)
    if (cur) cur.seed ??= seedNum
    else byId.set(s.external_id, { ...s, seed: seedNum })
  }
  const matches = [...(fixtures?.data ?? []), ...(results?.data?.singles ?? [])]
  for (const m of matches) {
    if (Number(m.roundId) < MAIN_FIRST_ROUND) continue
    add(m.player1, m.seed1)
    add(m.player2, m.seed2)
  }
  return [...byId.values()]
}
