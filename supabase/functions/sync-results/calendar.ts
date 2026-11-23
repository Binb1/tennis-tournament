// Tennis API calendar → tournaments.external_id. Pure functions (no I/O), so they can be tested on their own.
// GET {tour}/tournament/calendar/{year} lists every edition of the year with its id (the one the draws use, it
// changes every year). A wrong id would import another tournament's draw, so a match must be certain:
//   1. candidates: same level (Grand Slam / Masters 1000 / ATP 500-250), same country, API date from 7 days before
//      our main-draw start to 3 days after (the API may date an edition from its qualifying or its week);
//   2. both ways unique: one candidate for the tournament, and no other tournament claiming that event; when several
//      remain on either side, only the ones whose names share a word (city, sponsor) are kept;
//   3. still not one-to-one, or the id is already someone else's: no id, the admin sets it;
//   4. one-to-one but the names share no word ("unsure"): proposed, never written automatically. Only "matched"
//      ids are written. A Grand Slam needs no shared word (API: "French Open - Paris" for Roland-Garros): there is
//      never another Slam in the same country within the window.
// API names are "<name> - <city>" ("BNP Paribas Open - Indian Wells"), dated to the start of the week.

export type Level = "grand_slam" | "masters1000" | "tour"

export type ApiEvent = { id: string; name: string; date: string; level: Level; country: string }

export type Ours = { id: string; name: string; starts_at: string; category: string; country: string | null; external_id: string | null }

export type Match = {
  tournament_id: string
  name: string
  /** The id found, or null. */
  external_id: string | null
  /**
   * matched: one-to-one and the names share a word (the only status written); unsure: one-to-one, names differ
   * (proposed id, left to the admin); none: no candidate; ambiguous: several left after names; taken: id already used.
   */
  status: "matched" | "unsure" | "none" | "ambiguous" | "taken"
  /** The API events considered (name, date, id), for the admin and the logs. */
  candidates: { id: string; name: string; date: string }[]
}

const DAY = 24 * 3600 * 1000

/** API country codes are IOC (GER, SUI…), sometimes ISO alpha-3: both to IOC, as tournaments.country stores. */
const IOC: Record<string, string> = {
  DEU: "GER", CHE: "SUI", NLD: "NED", MCO: "MON", CHL: "CHI", HRV: "CRO", PRT: "POR", ARE: "UAE", ZAF: "RSA",
  DNK: "DEN", GRC: "GRE", BGR: "BUL", SVN: "SLO", IDN: "INA", MYS: "MAS", PHL: "PHI", SAU: "KSA", TWN: "TPE",
  URY: "URU", PRY: "PAR", VNM: "VIE",
}
export const ioc = (code: string | null | undefined) => {
  const c = (code ?? "").trim().toUpperCase()
  return IOC[c] ?? c
}

export const levelOf = (category: string): Level =>
  category === "grand_slam" ? "grand_slam" : category === "masters1000" ? "masters1000" : "tour"

/** Level from the API's rank (4 Slam, 3 Masters, 2 ATP 500/250, 1 Challenger/ITF), else from its tier label. */
function apiLevel(e: Record<string, unknown>): Level | null {
  const rank = Number(e.rankId ?? (e.rank as Record<string, unknown> | undefined)?.id)
  if (rank === 4) return "grand_slam"
  if (rank === 3) return "masters1000"
  if (rank === 2) return "tour"
  if (Number.isFinite(rank) && rank > 0) return null
  const label = [e.tier, (e.round as Record<string, unknown> | undefined)?.name, (e.rank as Record<string, unknown> | undefined)?.name]
    .filter((x) => typeof x === "string").join(" ").toLowerCase()
  if (/grand slam/.test(label)) return "grand_slam"
  if (/masters|1000/.test(label)) return "masters1000"
  if (/\b(500|250)\b/.test(label)) return "tour"
  return null
}

/** Calendar pages → tour-level events. Anything without an id, a date, a country or a known level is dropped. */
export function parseCalendar(pages: unknown[]): ApiEvent[] {
  const out: ApiEvent[] = []
  for (const page of pages) {
    const rows = Array.isArray(page) ? page : (page as { data?: unknown })?.data
    if (!Array.isArray(rows)) throw new Error("Calendrier : réponse inattendue (pas de liste data)")
    for (const r of rows as Record<string, unknown>[]) {
      const level = apiLevel(r)
      const country = ioc((r.country as Record<string, unknown> | undefined)?.acronym as string | undefined)
      const date = typeof r.date === "string" ? r.date : null
      if (r.id == null || !level || !country || !date || Number.isNaN(Date.parse(date))) continue
      out.push({ id: String(r.id), name: String(r.name ?? ""), date, level, country })
    }
  }
  return out
}

const STOP = new Set([
  "open", "tennis", "atp", "the", "of", "de", "di", "d", "del", "la", "le", "championships", "championship", "international",
  "masters", "tour", "cup", "presented", "by", "and", "men", "mens", "s", "classic", "grand", "prix", "tournament",
])
/** Distinctive words of a name: lower case, no accents, no stop words or years. */
export function words(name: string): Set<string> {
  return new Set(
    name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\./g, "").split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w)),
  )
}
const share = (a: string, b: string) => {
  const wb = words(b)
  return [...words(a)].some((w) => wb.has(w))
}

/**
 * One result per tournament of `ours`. `used`: external ids already held by other tournaments (never handed out
 * twice). Tournaments that already have an id are matched too (to check the matcher against known ids) but their id
 * is never counted as taken by themselves.
 */
export function matchCalendar(ours: Ours[], events: ApiEvent[], used: Map<string, string>): Match[] {
  const fits = (t: Ours, e: ApiEvent) => {
    const start = Date.parse(t.starts_at)
    const d = Date.parse(e.date)
    return e.level === levelOf(t.category) && e.country === ioc(t.country) && d >= start - 7 * DAY && d <= start + 3 * DAY
  }
  const cand = new Map(ours.map((t) => [t.id, events.filter((e) => fits(t, e))]))
  const claimedBy = (e: ApiEvent) => ours.filter((t) => cand.get(t.id)!.some((x) => x.id === e.id))

  return ours.map((t): Match => {
    const all = cand.get(t.id)!
    const candidates = all.map((e) => ({ id: e.id, name: e.name, date: e.date }))
    const base = { tournament_id: t.id, name: t.name, candidates }
    if (all.length === 0) return { ...base, external_id: null, status: "none" }
    // Several events for this tournament, or this event wanted by several tournaments: names decide.
    let pick = all
    if (all.length > 1 || claimedBy(all[0]).length > 1) pick = all.filter((e) => share(t.name, e.name))
    const unique =
      pick.length === 1 && claimedBy(pick[0]).filter((o) => o.id === t.id || share(o.name, pick[0].name)).length === 1
    if (!unique) return { ...base, external_id: null, status: "ambiguous" }
    const holder = used.get(pick[0].id)
    if (holder && holder !== t.id) return { ...base, external_id: null, status: "taken" }
    const sure = share(t.name, pick[0].name) || levelOf(t.category) === "grand_slam"
    return { ...base, external_id: pick[0].id, status: sure ? "matched" : "unsure" }
  })
}
