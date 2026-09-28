import { createClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co"
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || "missing-key"

export const supabase = createClient(url, key)

/* Row types (see supabase/migrations/0001_init.sql). */
export type TournamentStatus = "draft" | "registration" | "live" | "finished"

export type Profile = {
  id: string
  username: string
  is_admin: boolean
  deleted_at: string | null
}

export type Tournament = {
  id: string
  name: string
  tour: "ATP" | "WTA"
  draw_size: number
  status: TournamentStatus
  starts_at: string | null
  external_id?: string | null
  /** Style (theme id) painted on this tournament's pages; null = the player's choice. */
  theme?: string | null
}

export type Round = { id: string; tournament_id: string; idx: number; name: string; locks_at: string }
export type Player = { id: string; name: string; seed: number | null }
export type PlayerResult = { player_id: string; round_id: string; result: "won" | "lost" | null }
export type Pick = { entry_id: string; round_id: string; player_id: string }
export type EntryStatus = {
  entry_id: string
  tournament_id: string
  user_id: string | null
  alive: boolean
  eliminated_round: number | null
  rounds_survived: number
}

/** Public name of a user: deleted accounts show as "utilisateur supprimé". */
export function displayName(p: { username: string; deleted_at: string | null } | null | undefined) {
  if (!p || p.deleted_at) return "utilisateur supprimé"
  return p.username
}

/** Fetch every row of a query past the 1000-row API cap. */
export async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const size = 1000
  const rows: T[] = []
  for (let from = 0; ; from += size) {
    const res = await query(from, from + size - 1)
    if (res.error) throw new Error(res.error.message)
    const data = res.data as T[] | null
    rows.push(...(data ?? []))
    if (!data || data.length < size) return rows
  }
}

/**
 * Winning entry ids of finished tournaments: entries alive after the final; if none is alive,
 * the entries with the most rounds survived are co-winners.
 */
export async function fetchWinners(tournamentIds: string[]): Promise<Set<string>> {
  if (!tournamentIds.length) return new Set()
  const rows = await fetchAll<EntryStatus>((a, b) =>
    supabase.from("entry_status").select("*").in("tournament_id", tournamentIds).order("entry_id").range(a, b),
  )
  const winners = new Set<string>()
  for (const tid of tournamentIds) {
    const list = rows.filter((r) => r.tournament_id === tid)
    const anyAlive = list.some((r) => r.alive)
    const max = Math.max(0, ...list.map((r) => r.rounds_survived))
    for (const r of list) if (anyAlive ? r.alive : r.rounds_survived === max) winners.add(r.entry_id)
  }
  return winners
}

export type LastPick = { roundId: string; roundIdx: number; roundName: string; player: string; result: "won" | "lost" | null }

/** Latest pick (highest round) of each entry, with the player's result in that round. Keyed by entry id. */
export async function fetchLastPicks(entryIds: string[]): Promise<Record<string, LastPick>> {
  if (!entryIds.length) return {}
  type Row = Pick & { players: { name: string } | null; rounds: { idx: number; name: string } | null }
  const p = await supabase.from("picks").select("entry_id, round_id, player_id, players(name), rounds(idx, name)").in("entry_id", entryIds)
  if (p.error) throw new Error(p.error.message)
  const last: Record<string, Row> = {}
  for (const row of p.data as unknown as Row[]) {
    const cur = last[row.entry_id]
    if (!cur || (row.rounds?.idx ?? 0) > (cur.rounds?.idx ?? 0)) last[row.entry_id] = row
  }
  const rows = Object.values(last)
  if (!rows.length) return {}
  const r = await supabase
    .from("player_results")
    .select("player_id, round_id, result")
    .in("round_id", rows.map((x) => x.round_id))
    .in("player_id", rows.map((x) => x.player_id))
  if (r.error) throw new Error(r.error.message)
  const result = new Map((r.data as PlayerResult[]).map((x) => [`${x.player_id}:${x.round_id}`, x.result]))
  return Object.fromEntries(
    rows.map((x) => [
      x.entry_id,
      {
        roundId: x.round_id,
        roundIdx: x.rounds?.idx ?? 0,
        roundName: x.rounds?.name ?? "",
        player: x.players?.name ?? "?",
        result: result.get(`${x.player_id}:${x.round_id}`) ?? null,
      },
    ]),
  )
}

export const STATUS_LABEL: Record<TournamentStatus, string> = {
  draft: "Brouillon",
  registration: "Ouvert",
  live: "En cours",
  finished: "Terminé",
}

export function formatDate(iso: string | null, withTime = false) {
  if (!iso) return "Date à venir"
  return new Date(iso).toLocaleString("fr-FR", {
    weekday: withTime ? "long" : undefined,
    day: "numeric",
    month: "long",
    year: withTime ? undefined : "numeric",
    hour: withTime ? "2-digit" : undefined,
    minute: withTime ? "2-digit" : undefined,
  })
}
