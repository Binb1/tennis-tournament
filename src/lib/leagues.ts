import { readSeen, writeSeen } from "@/lib/seen"
import { supabase } from "@/lib/supabase"

/**
 * Friend leagues (migration 0020): a group of players with an invite code, at most 3 per player. Only a filter on
 * the season ranking and the tournament leaderboards; the game itself is the same for everyone.
 */
export const MAX_LEAGUES = 3

export type LeagueMember = {
  user_id: string
  joined_at: string
  profiles: { username: string; deleted_at: string | null } | null
}

export type League = {
  id: string
  name: string
  code: string
  owner_id: string
  created_at: string
  league_members: LeagueMember[]
}

/** My leagues with their members (RLS: members only see their own leagues), oldest first. */
export async function fetchMyLeagues(): Promise<League[]> {
  const { data, error } = await supabase
    .from("leagues")
    .select("id, name, code, owner_id, created_at, league_members(user_id, joined_at, profiles(username, deleted_at))")
    .order("created_at")
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as League[]
}

export const memberIds = (l: League) => new Set(l.league_members.map((m) => m.user_id))

/** The link a friend opens (or scans as a QR code) to join. */
export const inviteUrl = (code: string) => `${window.location.origin}/rejoindre/${code}`

/**
 * An invite opened while logged out: kept on the device through sign-up / login, then the app goes back to it.
 * Cleared once the invite page shows to a logged-in player.
 */
export const savePendingInvite = (code: string) => writeSeen("pending-invite", code)
export const clearPendingInvite = () => writeSeen("pending-invite", "")

/** Where to land after login or onboarding: the pending invite if any, else the tournaments. */
export function homePath() {
  const code = readSeen("pending-invite")
  return code ? `/rejoindre/${code}` : "/tournois"
}
