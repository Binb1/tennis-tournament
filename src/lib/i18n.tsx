import { Fragment, useSyncExternalStore, type ReactNode } from "react"

import { messages, type Messages } from "@/locales"
import type { Msg } from "@/locales/ns"

/**
 * French, English, Spanish. French is the source (src/locales/fr), en and es must have the same keys (type-checked).
 * Language: the visitor's saved choice, else the first of the browser's languages we have, else English.
 * index.html sets <html lang> before first paint with the same logic. Changing language remounts the app (App.tsx),
 * so plain t() calls anywhere (components, lib helpers) are always in the current language.
 */

export type Lang = "fr" | "en" | "es"
export const LANGS: { id: Lang; label: string; name: string }[] = [
  { id: "fr", label: "FR", name: "Français" },
  { id: "en", label: "EN", name: "English" },
  { id: "es", label: "ES", name: "Español" },
]
const LOCALE: Record<Lang, string> = { fr: "fr-FR", en: "en-GB", es: "es-ES" }
const KEY = "tiebreakers-lang"

const isLang = (l: unknown): l is Lang => LANGS.some((x) => x.id === l)

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (isLang(saved)) return saved
  } catch {
    /* storage unavailable */
  }
  const prefs = typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const p of prefs) {
    const two = p?.slice(0, 2).toLowerCase()
    if (isLang(two)) return two
  }
  return "en"
}

let lang: Lang = detect()
const listeners = new Set<() => void>()
if (typeof document !== "undefined") document.documentElement.lang = lang

export const getLang = () => lang
/** BCP 47 locale for dates and numbers: "fr-FR", "en-GB", "es-ES". */
export const locale = () => LOCALE[lang]

/** The visitor's choice: saved on this device, applied everywhere. */
export function setLang(l: Lang) {
  try {
    localStorage.setItem(KEY, l)
  } catch {
    /* storage unavailable */
  }
  if (l === lang) return
  lang = l
  document.documentElement.lang = l
  listeners.forEach((f) => f())
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    () => lang,
  )
}

/* ------------------------------------------------------------------ */

type Ns = keyof Messages
/** "namespace.key", e.g. "tournament.lockIn". */
export type MsgKey = { [N in Ns]: `${N & string}.${keyof Messages[N] & string}` }[Ns]
type Vars = Record<string, string | number | null | undefined>

function pick(key: MsgKey, vars?: { count?: unknown }): string {
  const [ns, k] = key.split(".") as [Ns, string]
  const m = ((messages[lang][ns] as Record<string, Msg> | undefined)?.[k] ??
    (messages.fr[ns] as Record<string, Msg>)[k]) as Msg | undefined
  if (m == null) return key
  if (typeof m === "string") return m
  const n = Number(vars?.count ?? 0)
  if (n === 0 && m.zero != null) return m.zero
  return new Intl.PluralRules(LOCALE[lang]).select(n) === "one" ? m.one : m.other
}

/** Translated text, "{name}" placeholders filled from `vars` (`count` also picks the plural form). */
export function t(key: MsgKey, vars?: Vars): string {
  return pick(key, vars).replace(/\{(\w+)\}/g, (all, v: string) => (vars && vars[v] != null ? String(vars[v]) : all))
}

/** Like t(), but placeholders can be elements: links, bold names, flags. */
export function tr(key: MsgKey, vars: Record<string, ReactNode>): ReactNode {
  return pick(key, vars as { count?: unknown })
    .split(/(\{\w+\})/)
    .map((part, i) => {
      const v = /^\{(\w+)\}$/.exec(part)?.[1]
      return <Fragment key={i}>{v && v in vars ? vars[v] : part}</Fragment>
    })
}

/* ------------------------------------------------------------------ */

/**
 * Round names are stored in French ("1er tour", "8es de finale", "Quarts", "Demies", "Finale"): shown as stored in
 * French (admin renames included), translated otherwise. An unknown name is shown as is.
 */
export function roundName(name: string): string {
  if (lang === "fr") return name
  const n = /^(\d+)\s*(?:er|e|ème)\s+tour$/i.exec(name.trim())?.[1]
  if (n) return t("round.nth", { n })
  const map: Record<string, MsgKey> = {
    "8es de finale": "round.r16",
    quarts: "round.qf",
    demies: "round.sf",
    finale: "round.final",
  }
  const k = map[name.trim().toLowerCase()]
  return k ? t(k) : name
}

/** A round's name in a few characters ("T2", "1/4", "F"), for tight spots. */
export function roundShort(name: string): string {
  const n = /^(\d+)\s*(?:er|e|ème)\s+tour$/i.exec(name.trim())?.[1]
  if (n) return t("round.shortNth", { n })
  const map: Record<string, MsgKey> = {
    "8es de finale": "round.shortR16",
    quarts: "round.shortQf",
    demies: "round.shortSf",
    finale: "round.shortFinal",
  }
  const k = map[name.trim().toLowerCase()]
  return k ? t(k) : name
}

/** Database errors (raised in French by the RPCs) in the current language; unknown ones as they come. */
export function dbError(message: string): string {
  if (lang === "fr") return message
  const k = (Object.keys(DB_ERRORS) as (keyof typeof DB_ERRORS)[]).find((fr) => message.startsWith(fr))
  return k ? t(DB_ERRORS[k]) : message
}
const DB_ERRORS = {
  "Ce joueur a déjà été choisi": "errors.playerUsed",
  "Ce joueur a déclaré forfait": "errors.playerWithdrawn",
  "Ce joueur est déjà éliminé": "errors.playerOut",
  "Ce joueur est exempté de ce tour": "errors.playerBye",
  "Ce joueur ne fait pas partie de ce tournoi": "errors.playerNotInTournament",
  "Ce tour est verrouillé": "errors.roundLocked",
  "Choisissez un pseudo avant de rejoindre un tournoi": "errors.usernameFirst",
  "Connexion requise": "errors.loginRequired",
  "Le pronostic du vainqueur est fermé": "errors.championClosed",
  "Les choix ne sont pas ouverts pour ce tournoi": "errors.picksClosed",
  "Les inscriptions sont fermées": "errors.joinClosed",
  "Les pronostics ne sont pas ouverts pour ce tournoi": "errors.championNotOpen",
  "Seul le 1er tour est ouvert pendant les inscriptions": "errors.onlyFirstRound",
  "Tour introuvable": "errors.roundNotFound",
  "Tournoi introuvable": "errors.tournamentNotFound",
  "Vous êtes déjà inscrit à ce tournoi": "errors.alreadyJoined",
  "Vous êtes éliminé de ce tournoi": "errors.eliminated",
  "Vous n'êtes pas inscrit à ce tournoi": "errors.notJoined",
} as const satisfies Record<string, MsgKey>
