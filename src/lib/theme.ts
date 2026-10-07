import { useEffect, useSyncExternalStore } from "react"

import { supabase } from "@/lib/supabase"

/**
 * Court surface theme. The palette, fonts and textures live in index.css under
 * `html[data-theme=…]`; this module only stores the choice and sets the attribute.
 * Default (no choice saved): the live tournament's style, else clay.
 * index.html applies the stored theme before first paint (same keys, same logic).
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

export const THEME_GROUPS: { id: ThemeGroup; label: string }[] = [
  { id: "slam", label: "Grand Chelem" },
  { id: "masters", label: "Masters 1000" },
]

/**
 * `court`/`outer`/`line` draw the picker swatches; `color` is the header wall (browser theme-color).
 * `stripe`: optional second grass tone (mown stripes) on the swatch.
 */
export const THEMES: {
  id: ThemeId
  label: string
  group: ThemeGroup
  court: string
  outer: string
  line: string
  color: string
  stripe?: string
}[] = [
  { id: "clay", label: "Roland-Garros", group: "slam", court: "#bc5128", outer: "#bc5128", line: "#f7f2e8", color: "#00503c" },
  { id: "usopen", label: "US Open", group: "slam", court: "#3c638e", outer: "#557f49", line: "#ffffff", color: "#0b1f3a" },
  { id: "ao", label: "Open d'Australie", group: "slam", court: "#1b74b3", outer: "#0f4f86", line: "#ffffff", color: "#062a4d" },
  { id: "wimbledon", label: "Wimbledon", group: "slam", court: "#477833", outer: "#3e6b2a", line: "#f5efdc", color: "#0c3b1f", stripe: "#3e6b2a" },
  { id: "indianwells", label: "Indian Wells", group: "masters", court: "#3d64a3", outer: "#5b4d8a", line: "#ffffff", color: "#1b3a2b" },
  { id: "miami", label: "Miami", group: "masters", court: "#2b6ca6", outer: "#12707a", line: "#ffffff", color: "#0a3140" },
  { id: "montecarlo", label: "Monte-Carlo", group: "masters", court: "#ad5028", outer: "#ad5028", line: "#f7f2e8", color: "#0a2d5c" },
  { id: "madrid", label: "Madrid", group: "masters", court: "#b24a27", outer: "#b24a27", line: "#f7f2e8", color: "#2a0a1f" },
  { id: "rome", label: "Rome", group: "masters", court: "#a8552e", outer: "#a8552e", line: "#f7f2e8", color: "#1a3a2a" },
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

// Storage keys keep the app's former name (Tiebreakers) so saved choices survive the rename.
const KEY = "tiebreakers-theme"
/** Last known live tournament style, cached so the next visit paints it before the fetch. */
const LIVE_KEY = "tiebreakers-live-theme"
const listeners = new Set<() => void>()
let live: ThemeId | null = null
let overridden = false // a tournament page is painting its own style

function stored(key: string): ThemeId | null {
  try {
    const t = localStorage.getItem(key)
    if (isThemeId(t)) return t
  } catch {
    /* storage unavailable */
  }
  return null
}

export function getTheme(): ThemeId {
  return stored(KEY) ?? live ?? stored(LIVE_KEY) ?? "clay"
}

/** Fetch the live tournament's style (latest start wins) and paint it when the player has no saved choice. */
export async function loadLiveTheme() {
  const { data, error } = await supabase
    .from("tournaments")
    .select("theme")
    .eq("status", "live")
    .not("theme", "is", null)
    .order("starts_at", { ascending: false })
    .limit(1)
  if (error) return
  const t = data[0]?.theme
  live = isThemeId(t) ? t : "clay"
  try {
    if (isThemeId(t)) localStorage.setItem(LIVE_KEY, t)
    else localStorage.removeItem(LIVE_KEY)
  } catch {
    /* storage unavailable */
  }
  // A tournament page's own style stays on until it unmounts (it repaints getTheme() then).
  if (!stored(KEY) && !overridden) apply(live)
}

/** Paint a theme without saving it. */
function apply(id: ThemeId) {
  const root = document.documentElement
  if (id === "clay") delete root.dataset.theme
  else root.dataset.theme = id
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEMES.find((x) => x.id === id)!.color)
  listeners.forEach((l) => l())
}

/** The player's choice: painted and saved. */
export function setTheme(id: ThemeId) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* storage unavailable */
  }
  apply(id)
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
