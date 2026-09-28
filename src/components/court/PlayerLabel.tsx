import { flagEmoji } from "@/lib/flags"
import type { Match, Player } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/** Emoji flag, or the raw code in small caps when unknown. */
export function Flag({ code, className }: { code?: string | null; className?: string }) {
  if (!code) return null
  const emoji = flagEmoji(code)
  return emoji ? (
    <span role="img" aria-label={code} title={code} className={cn("shrink-0 leading-none", className)}>
      {emoji}
    </span>
  ) : (
    <span title={code} className={cn("shrink-0 text-[10px] font-bold tracking-[0.06em] text-chalk/75 lowercase [font-variant:small-caps]", className)}>
      {code}
    </span>
  )
}

/** Flag + name + small world ranking. The name truncates. */
export function PlayerName({ p, className, rank = true }: { p?: Player | null; className?: string; rank?: boolean }) {
  if (!p) return <span className={cn("min-w-0 truncate text-chalk/70 italic", className)}>à déterminer</span>
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <Flag code={p.country} />
      <span className="min-w-0 truncate">{p.name}</span>
      {rank && p.ranking && <span className="shrink-0 text-[10px] font-medium no-underline opacity-70 tabular-nums">#{p.ranking}</span>}
    </span>
  )
}

/** "mer. 30 sept. 14:00" in local time; date only when the API gave no time (UTC midnight). */
export function formatMatchTime(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  const day = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return day
  return `${day} ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
}

/**
 * One line about a player's match in a round: opponent and time, or the result.
 * "vs Flavio Cobolli (#18) · mer. 30 sept. 14:00", "bat X · 6-4 6-3", "battu par X · 6-4 6-3".
 */
export function MatchLine({
  m,
  pid,
  playerById,
  className,
  wrap = false,
}: {
  m?: Match
  pid: string
  playerById: Map<string, Player>
  className?: string
  /** Show the whole line instead of truncating it. */
  wrap?: boolean
}) {
  if (!m) return null
  const oppId = m.player1_id === pid ? m.player2_id : m.player1_id
  const opp = oppId ? playerById.get(oppId) : undefined
  const oppLabel = opp ? `${opp.name}${opp.ranking ? ` (#${opp.ranking})` : ""}` : "à déterminer"
  let text: string
  if (m.status === "done" && m.winner_id) {
    text = `${m.winner_id === pid ? "bat" : "battu par"} ${oppLabel}${m.score ? ` · ${m.score}` : ""}`
  } else {
    const when = formatMatchTime(m.scheduled_at)
    text = `${m.status === "live" ? "En cours · " : ""}vs ${oppLabel}${when ? ` · ${when}` : ""}${m.status === "live" && m.score ? ` · ${m.score}` : ""}`
  }
  return <span className={cn("block text-xs font-normal no-underline opacity-80", !wrap && "truncate", className)}>{text}</span>
}
