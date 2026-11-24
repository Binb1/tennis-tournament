// Alerts: sync-results → PostHog → Slack. Each problem is one `sync_alert` event whose `problem` property is the
// Slack line, and each scheduled run sends one `sync_heartbeat`. In PostHog (project Tennis-tournament), the insight
// "Alert source: Tennis sync problems" lists the problems sent in the last complete hour, plus one line when the
// function stops running while it still had work; the hourly alert "🎾 Tennis sync" posts them to Slack.
// A problem that lasts (no id, no draw) is sent once a day, by the 07:00 UTC run, so it pings once a day.
// Sending never throws: alerting must not break the sync.

/** Project token of Tennis-tournament: public, the web app ships it too (VITE_POSTHOG_KEY). */
const POSTHOG_KEY = Deno.env.get("POSTHOG_KEY") ?? "phc_m9SW5gFFF2HzYcL2YPdBz7bhNGS6UWuXLpF5nNgfEqMv"
const POSTHOG_HOST = "https://eu.i.posthog.com"

export type Alert = {
  kind: "missing_id" | "missing_draw" | "id_proposal" | "id_written" | "sync_failed" | "budget" | "crashed"
  problem: string
  tournament_id?: string
}

export type Open = {
  id: string
  name: string
  external_id: string | null
  status: string
  tour: string
  test: boolean
  starts_at: string | null
  draw_size: number
  players: number
}

const HOUR = 3600_000
const DAY = 24 * HOUR

/** Hour (UTC) of the daily run that repeats lasting problems. */
export const DAILY_HOUR = 7

/**
 * True when the hourly cron will call the function again (migration 0023 has the same rule): a tournament with an
 * id that is live or starts within 3 days, or an ATP tournament without an id that starts within 60 days.
 */
export function expectsNextRun(ts: Open[], now: number): boolean {
  return ts.some((t) => {
    const start = t.starts_at ? Date.parse(t.starts_at) : Infinity
    if (t.external_id) return t.status === "live" || (t.status === "registration" && start <= now + 3 * DAY)
    return t.status === "registration" && t.tour === "ATP" && !t.test && start <= now + 60 * DAY
  })
}

/**
 * Lasting problems, for the daily run: a real tournament with no API id that starts within 7 days or has started
 * (results can't sync), and one with an id whose draw isn't imported 30 h before the first lock.
 * `calendar`: tournament name → status of the last calendar match (none, unsure…), when known.
 */
export function dailyProblems(ts: Open[], now: number, calendar: Map<string, string>): Alert[] {
  const out: Alert[] = []
  for (const t of ts) {
    if (t.test || !t.starts_at) continue
    const left = Date.parse(t.starts_at) - now
    if (!t.external_id && left <= 7 * DAY) {
      const why = calendar.get(t.name)
      const when = left > 0 ? `starts in ${Math.ceil(left / DAY)} day${left > DAY ? "s" : ""}` : "has started, results can't sync"
      out.push({
        kind: "missing_id",
        tournament_id: t.id,
        problem: `⚠️ ${t.name}: no Tennis API id, ${when}${why ? ` (calendar: ${why})` : ""}. Set it in the admin, Synchronisation.`,
      })
    } else if (t.external_id && t.status === "registration" && left <= 30 * HOUR && t.players === 0) {
      out.push({
        kind: "missing_draw",
        tournament_id: t.id,
        problem: `⚠️ ${t.name}: no player imported yet, first lock in ${Math.max(0, Math.round(left / HOUR))} h. Check the draw in the admin.`,
      })
    }
  }
  return out
}

/** Sends the alerts and the heartbeat to PostHog in one request. Logs and swallows any failure. */
export async function capture(alerts: Alert[], heartbeat: Record<string, unknown> | null) {
  const timestamp = new Date().toISOString()
  const batch = [
    ...alerts.map((a) => ({ event: "sync_alert", properties: { ...a } as Record<string, unknown> })),
    ...(heartbeat ? [{ event: "sync_heartbeat", properties: heartbeat }] : []),
  ].map((e) => ({
    ...e,
    distinct_id: "sync-results",
    timestamp,
    properties: { ...e.properties, $process_person_profile: false },
  }))
  if (!batch.length) return
  try {
    const res = await fetch(`${POSTHOG_HOST}/batch/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: POSTHOG_KEY, batch }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) console.error("PostHog capture", res.status, (await res.text()).slice(0, 200))
  } catch (e) {
    console.error("PostHog capture failed:", e)
  }
}
