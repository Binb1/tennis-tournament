import posthog from "posthog-js"

// Usage volume and retention only: pageviews, who is active, and the few actions that make a player.
// Without a key (local dev by default) nothing is sent.
const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const enabled = !!key

export function initAnalytics() {
  if (!enabled) return
  posthog.init(key, {
    api_host: "https://eu.i.posthog.com",
    defaults: "2026-08-30",
    person_profiles: "identified_only",
    autocapture: false,
    disable_session_recording: true,
  })
}

export function identify(user: { id: string; username: string; is_admin: boolean }) {
  if (!enabled) return
  posthog.identify(user.id, { username: user.username, is_admin: user.is_admin })
}

export function resetIdentity() {
  if (enabled) posthog.reset()
}

type Events = {
  signed_up: Record<string, never>
  tournament_joined: { tournament_id: string; tournament_name: string; category: string | null }
  pick_made: { tournament_id: string; round_name: string; is_change: boolean }
}

export function track<E extends keyof Events>(event: E, props: Events[E]) {
  if (enabled) posthog.capture(event, props)
}
