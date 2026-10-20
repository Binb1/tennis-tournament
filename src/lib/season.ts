import { locale, t } from "@/lib/i18n"
import type { Category } from "@/lib/scoring"
import { fetchAll, supabase } from "@/lib/supabase"

/**
 * Season ranking (views season_standings / season_entry_points, migrations 0010 and 0014; points: lib/scoring.ts).
 * Season = calendar year of the tournament's start; live and finished tournaments count.
 */
export type SeasonRow = {
  season: number
  user_id: string
  username: string
  deleted_at: string | null
  points: number
  rounds_won: number
  tournaments_won: number
  tournaments_played: number
  round_points: number
  winner_bonus: number
  champion_bonus: number
  champions_predicted: number
}

export type EntryPoints = {
  season: number
  entry_id: string
  tournament_id: string
  points: number
  rounds_won: number
  won_tournament: boolean
  category: Category
  round_points: number
  winner_bonus: number
  champion_bonus: number
  champion_correct: boolean
}

export type Ranked = SeasonRow & { rank: number; tied: boolean }

/** Competition ranking: points, then tournaments played, tournaments won, rounds won; equal rows share a rank. */
export function rankSeason(rows: SeasonRow[]): Ranked[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      b.tournaments_played - a.tournaments_played ||
      b.tournaments_won - a.tournaments_won ||
      b.rounds_won - a.rounds_won ||
      a.username.localeCompare(b.username, locale()),
  )
  const same = (a: SeasonRow, b: SeasonRow) =>
    a.points === b.points &&
    a.tournaments_played === b.tournaments_played &&
    a.tournaments_won === b.tournaments_won && a.rounds_won === b.rounds_won
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

/**
 * Latest season points reset (migration 0015), or null: points count from rounds locked after it.
 * Only feeds a note, so an error (e.g. the migration not applied yet) is no reset rather than a broken page.
 */
export async function fetchLastReset(): Promise<string | null> {
  const { data } = await supabase.from("season_resets").select("at").order("at", { ascending: false }).limit(1)
  return (data as { at: string }[] | null)?.[0]?.at ?? null
}

export const seasonsOf = (rows: { season: number }[]) => [...new Set(rows.map((r) => r.season))].sort((a, b) => b - a)

/** Rank suffix in the current language: "er" / "e" (1er, 2e), "st" / "nd" / "rd" / "th", ".º". */
export function rankSuffix(rank: number): string {
  const form = new Intl.PluralRules(locale(), { type: "ordinal" }).select(rank)
  return form === "one" ? t("common.ordOne") : form === "two" ? t("common.ordTwo") : form === "few" ? t("common.ordFew") : t("common.ordOther")
}

/** "1er", "2nd", "3.º": the rank with its suffix. */
export const rankOrdinal = (rank: number) => `${rank}${rankSuffix(rank)}`
