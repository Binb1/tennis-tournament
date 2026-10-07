import { fetchAll, supabase } from "@/lib/supabase"

/**
 * Season ranking (views season_standings / season_entry_points, migration 0010).
 * Season = calendar year of the tournament's start; live and finished tournaments count.
 */
export const POINTS_PER_ROUND = 10
export const POINTS_PER_WIN = 50

export type SeasonRow = {
  season: number
  user_id: string
  username: string
  deleted_at: string | null
  points: number
  rounds_won: number
  tournaments_won: number
  tournaments_played: number
}

export type EntryPoints = {
  season: number
  entry_id: string
  tournament_id: string
  points: number
  rounds_won: number
  won_tournament: boolean
}

export type Ranked = SeasonRow & { rank: number; tied: boolean }

/** Competition ranking: points, then tournaments won, then rounds won; equal rows share a rank. */
export function rankSeason(rows: SeasonRow[]): Ranked[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      b.tournaments_won - a.tournaments_won ||
      b.rounds_won - a.rounds_won ||
      a.username.localeCompare(b.username, "fr"),
  )
  const same = (a: SeasonRow, b: SeasonRow) =>
    a.points === b.points && a.tournaments_won === b.tournaments_won && a.rounds_won === b.rounds_won
  const ranks: number[] = []
  sorted.forEach((r, i) => ranks.push(i > 0 && same(sorted[i - 1], r) ? ranks[i - 1] : i + 1))
  return sorted.map((r, i) => ({ ...r, rank: ranks[i], tied: ranks.filter((x) => x === ranks[i]).length > 1 }))
}

/** Every season's rows (a few hundred at most), so pages can offer past seasons. */
export function fetchSeasons(): Promise<SeasonRow[]> {
  return fetchAll<SeasonRow>((a, b) =>
    supabase.from("season_standings").select("*").order("season", { ascending: false }).order("user_id").range(a, b),
  )
}

export const seasonsOf = (rows: { season: number }[]) => [...new Set(rows.map((r) => r.season))].sort((a, b) => b - a)
