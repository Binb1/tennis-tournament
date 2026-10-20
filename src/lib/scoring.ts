import { THEMES } from "@/lib/theme"

/**
 * Season points, mirror of migration 0014 (category_multiplier, round_weight, season_entry_points).
 * A round won = its weight (counted back from the final) x the tournament's multiplier.
 * Pool winner and right champion prediction: +10 x the multiplier each.
 */
export type Category = "atp250" | "atp500" | "masters1000" | "grand_slam"

/**
 * `color`: the category's code colour, same on every court style (light tones, ink text, so they stand out on clay,
 * hard court, grass and indoor alike). Gets warmer and richer up the ladder: 250 mint, 500 sky, 1000 lilac, Slam gold.
 */
export const CATEGORIES: { id: Category; label: string; short: string; mult: number; color: string }[] = [
  { id: "atp250", label: "ATP 250", short: "250", mult: 2, color: "#a3e4c5" },
  { id: "atp500", label: "ATP 500", short: "500", mult: 3, color: "#9fd0f5" },
  { id: "masters1000", label: "Masters 1000", short: "1000", mult: 5, color: "#d2b8ff" },
  { id: "grand_slam", label: "Grand Chelem", short: "GC", mult: 8, color: "#f6c945" },
]

export const BONUS = 10

/** Weight of a round by the rounds still to play after it: final, semis, quarters, 8es, 16es, then 1. */
const WEIGHTS = [10, 7, 5, 3, 2]
export const roundWeight = (left: number) => WEIGHTS[left] ?? 1

export const categoryOf = (c: Category | null | undefined) => CATEGORIES.find((x) => x.id === c) ?? CATEGORIES[0]
export const multiplier = (c: Category | null | undefined) => categoryOf(c).mult

/** Points for winning round `idx` of `lastIdx` (the final). */
export const roundPoints = (c: Category | null | undefined, idx: number, lastIdx: number) =>
  roundWeight(lastIdx - idx) * multiplier(c)

/** Pool winner bonus, and the same for a right champion prediction. */
export const bonusPoints = (c: Category | null | undefined) => BONUS * multiplier(c)

/** Rounds of a draw before its rounds exist (same count as the admin's round generator). */
export const roundsOfDraw = (drawSize: number) => Math.max(1, Math.round(Math.log2(drawSize)))

/** A perfect run: every round won, pool won, champion predicted. */
export const maxPoints = (c: Category, rounds: number) =>
  Array.from({ length: rounds }, (_, i) => roundWeight(i)).reduce((a, b) => a + b, 0) * multiplier(c) + 2 * bonusPoints(c)

/** Default category for a new tournament: from its style (Grand Chelem / Masters theme), else 250. */
export function suggestCategory(theme: string | null | undefined): Category {
  const group = THEMES.find((t) => t.id === theme)?.group
  return group === "slam" ? "grand_slam" : group === "masters" ? "masters1000" : "atp250"
}
