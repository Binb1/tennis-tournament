import { useEffect, useSyncExternalStore } from "react"

import { t } from "@/lib/i18n"
import { supabase } from "@/lib/supabase"

/**
 * Court surface theme. The palette, fonts and textures live in index.css under
 * `html[data-theme=…]`; this module only stores the choice and sets the attribute.
 * The player picks "dynamic" (default) or one of the four Slams. Dynamic: the Masters 1000 being played (a live
 * tournament with a Masters style), else the next Grand Slam on the calendar. A tournament page paints its own style.
 * index.html applies the same choice before first paint (same keys, same logic).
 */

export type ThemeId =
  | "clay"
  | "usopen"
  | "ao"
  | "wimbledon"
  | "indianwells"
  | "miami"
  | "montecarlo"
  | "madrid"
  | "rome"
  | "canada"
  | "cincinnati"
  | "shanghai"
  | "paris"

export type ThemeGroup = "slam" | "masters"

/** `label`: getters, read in the current language. */
export const THEME_GROUPS: { id: ThemeGroup; readonly label: string }[] = [
  {
    id: "slam",
    get label() {
      return t("theme.groupSlam")
    },
  },
  {
    id: "masters",
    get label() {
      return t("theme.groupMasters")
    },
  },
]

/**
 * `court`/`outer`/`line` draw the picker swatches; `color` is the header wall (browser theme-color).
 * `stripe`: optional second grass tone (mown stripes) on the swatch.
 * `label`: tournament names, the ones with a local name (Australian Open, Roma) are getters in the current language.
 */
export const THEMES: {
  id: ThemeId
  readonly label: string
  group: ThemeGroup
  court: string
  outer: string
  line: string
  color: string
  stripe?: string
}[] = [
  { id: "clay", label: "Roland-Garros", group: "slam", court: "#bc5128", outer: "#bc5128", line: "#f7f2e8", color: "#00503c" },
  { id: "usopen", label: "US Open", group: "slam", court: "#3c638e", outer: "#557f49", line: "#ffffff", color: "#0b1f3a" },
  { id: "ao", get label() { return t("theme.ao") }, group: "slam", court: "#1b74b3", outer: "#0f4f86", line: "#ffffff", color: "#062a4d" },
  { id: "wimbledon", label: "Wimbledon", group: "slam", court: "#477833", outer: "#3e6b2a", line: "#f5efdc", color: "#0c3b1f", stripe: "#3e6b2a" },
  { id: "indianwells", label: "Indian Wells", group: "masters", court: "#3d64a3", outer: "#5b4d8a", line: "#ffffff", color: "#1b3a2b" },
  { id: "miami", label: "Miami", group: "masters", court: "#2b6ca6", outer: "#12707a", line: "#ffffff", color: "#0a3140" },
  { id: "montecarlo", label: "Monte-Carlo", group: "masters", court: "#ad5028", outer: "#ad5028", line: "#f7f2e8", color: "#0a2d5c" },
  { id: "madrid", label: "Madrid", group: "masters", court: "#b24a27", outer: "#b24a27", line: "#f7f2e8", color: "#2a0a1f" },
  { id: "rome", get label() { return t("theme.rome") }, group: "masters", court: "#a8552e", outer: "#a8552e", line: "#f7f2e8", color: "#1a3a2a" },
  { id: "canada", label: "Canada", group: "masters", court: "#2f5e9c", outer: "#1d3a68", line: "#ffffff", color: "#b0162f" },
  { id: "cincinnati", label: "Cincinnati", group: "masters", court: "#2e5a92", outer: "#3d7644", line: "#ffffff", color: "#13301f" },
  { id: "shanghai", label: "Shanghai", group: "masters", court: "#5d4192", outer: "#422c70", line: "#ffffff", color: "#7a1016" },
  { id: "paris", label: "Paris", group: "masters", court: "#1e2940", outer: "#121826", line: "#ffffff", color: "#07090f" },
]

export const isThemeId = (t: unknown): t is ThemeId => THEMES.some((x) => x.id === t)

/** Style suggested from a tournament name (admin forms). Order matters: "Rolex Paris" before any generic word. */
const SUGGEST: [RegExp, ThemeId][] = [
  [/roland|french open|internationaux de france/i, "clay"],
  [/us open|flushing/i, "usopen"],
  [/australi/i, "ao"],
  [/wimbledon/i, "wimbledon"],
  [/indian wells|bnp paribas open/i, "indianwells"],
  [/miami/i, "miami"],
  [/monte[\s-]?carlo|monaco/i, "montecarlo"],
  [/madrid|mutua/i, "madrid"],
  [/\brome\b|\broma\b|internazionali|italian|italie/i, "rome"],
  [/canada|canadian|montr[eé]al|toronto|national bank/i, "canada"],
  [/cincinnati/i, "cincinnati"],
  [/shanghai/i, "shanghai"],
  [/paris|bercy/i, "paris"],
]

export function suggestTheme(name: string): ThemeId | null {
  return SUGGEST.find(([re]) => re.test(name))?.[1] ?? null
}

export const themeLabel = (id: ThemeId) => THEMES.find((x) => x.id === id)!.label

/** The Slams in calendar order, with the day after each one ends (month 1-12, day): the next Slam is the first not over. */
export const SLAMS: { id: ThemeId; until: [number, number] }[] = [
  { id: "ao", until: [2, 3] },
  { id: "clay", until: [6, 10] },
  { id: "wimbledon", until: [7, 16] },
  { id: "usopen", until: [9, 12] },
]
const isSlam = (t: unknown): t is ThemeId => SLAMS.some((x) => x.id === t)

/** The Slam being played or coming next. */
export function nextSlam(now = new Date()): ThemeId {
  const md = [now.getMonth() + 1, now.getDate()]
  return (SLAMS.find(({ until: [m, d] }) => md[0] < m || (md[0] === m && md[1] < d)) ?? SLAMS[0]).id
}

export type ThemeChoice = ThemeId | "dynamic"

const KEY = "tiebreakers-theme"
/** Last dynamic style (live Masters 1000 or next Slam), cached so the next visit paints it before the fetch. */
const LIVE_KEY = "tiebreakers-live-theme"
const listeners = new Set<() => void>()
let live: ThemeId | null = null
let overridden = false // a tournament page is painting its own style

/** The player's choice: a Slam, else dynamic (an old saved Masters style counts as dynamic). */
function choice(): ThemeChoice {
  try {
    const t = localStorage.getItem(KEY)
    if (isSlam(t)) return t
  } catch {
    /* storage unavailable */
  }
  return "dynamic"
}

/** The dynamic style: the live Masters 1000's, else the next Slam's (cached until the fetch answers). */
export function dynamicTheme(): ThemeId {
  if (live) return live
  try {
    const t = localStorage.getItem(LIVE_KEY)
    if (isThemeId(t)) return t
  } catch {
    /* storage unavailable */
  }
  return nextSlam()
}

export function getTheme(): ThemeId {
  const c = choice()
  return c === "dynamic" ? dynamicTheme() : c
}

/** Fetch the live Masters 1000 style (latest start wins) and paint the dynamic style when the player is on it. */
export async function loadLiveTheme() {
  const { data, error } = await supabase
    .from("tournaments")
    .select("theme")
    .eq("status", "live")
    .eq("test", false)
    .not("theme", "is", null)
    .order("starts_at", { ascending: false })
  if (error) return
  const masters = data.map((r) => r.theme).find((t) => THEMES.some((x) => x.id === t && x.group === "masters"))
  live = isThemeId(masters) ? masters : nextSlam()
  try {
    localStorage.setItem(LIVE_KEY, live)
  } catch {
    /* storage unavailable */
  }
  // A tournament page's own style stays on until it unmounts (it repaints getTheme() then).
  if (choice() === "dynamic" && !overridden) apply(live)
  else listeners.forEach((l) => l())
}

/** Paint a theme without saving it. */
function apply(id: ThemeId) {
  const root = document.documentElement
  if (id === "clay") delete root.dataset.theme
  else root.dataset.theme = id
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEMES.find((x) => x.id === id)!.color)
  listeners.forEach((l) => l())
}

/** The player's choice: saved and painted. */
export function setTheme(c: ThemeChoice) {
  try {
    if (c === "dynamic") localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, c)
  } catch {
    /* storage unavailable */
  }
  apply(getTheme())
}

/**
 * A tournament's own style, painted while the page is mounted; the saved choice is untouched
 * and comes back on leave. Picking a surface meanwhile still saves (and shows) the player's choice.
 */
export function useThemeOverride(id: string | null | undefined) {
  useEffect(() => {
    if (!isThemeId(id)) return
    overridden = true
    apply(id)
    return () => {
      overridden = false
      apply(getTheme())
    }
  }, [id])
}

/** The player's choice ("dynamic" or a Slam), for the picker. */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    choice,
  )
}

/** Current theme, kept in sync across every picker on the page. */
export function useTheme(): ThemeId {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => (document.documentElement.dataset.theme as ThemeId | undefined) ?? "clay",
  )
}
