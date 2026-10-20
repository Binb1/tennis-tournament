/* Every namespace, one file each with its three languages. Add a namespace: create the file, import it here. */
import round from "@/locales/round"
import errors from "@/locales/errors"
import lang from "@/locales/lang"
import tournament from "@/locales/tournament"
import bracket from "@/locales/bracket"
import match from "@/locales/match"
import stake from "@/locales/stake"
import landing from "@/locales/landing"
import login from "@/locales/login"
import welcome from "@/locales/welcome"
import rules from "@/locales/rules"
import points from "@/locales/points"
import auth from "@/locales/auth"
import common from "@/locales/common"
import tournaments from "@/locales/tournaments"
import season from "@/locales/season"
import profile from "@/locales/profile"
import shell from "@/locales/shell"
import socials from "@/locales/socials"
import theme from "@/locales/theme"
import category from "@/locales/category"
import time from "@/locales/time"

const all = { round, errors, lang, tournament, bracket, match, stake, landing, login, welcome, rules, points, auth, common, tournaments, season, profile, shell, socials, theme, category, time }

type All = typeof all
export type Messages = { [N in keyof All]: All[N]["fr"] }
type Lang = "fr" | "en" | "es"

export const messages = Object.fromEntries(
  (["fr", "en", "es"] as const).map((l) => [l, Object.fromEntries(Object.entries(all).map(([n, m]) => [n, m[l]]))]),
) as Record<Lang, Messages>
