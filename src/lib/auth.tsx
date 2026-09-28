import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import type { Session } from "@supabase/supabase-js"
import { Navigate } from "react-router-dom"

import { supabase, type Profile } from "@/lib/supabase"
import { AppShell, ErrorBox, LineButton, Loading } from "@/components/court/AppShell"

type Auth = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  error: string | null
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // User whose profile is loaded: a different user signing in must not be routed with a stale/null profile.
  const loadedFor = useRef<string | null>(null)

  const loadProfile = useCallback(async (s: Session | null) => {
    setError(null)
    if (!s) {
      loadedFor.current = null
      setProfile(null)
      return
    }
    const { data, error } = await supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle()
    if (error) setError(error.message)
    else loadedFor.current = s.user.id
    setProfile((data as Profile | null) ?? null)
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await loadProfile(data.session)
      if (active) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      // Load outside the callback (supabase-js recommends not awaiting inside it).
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        const newUser = !!s && s.user.id !== loadedFor.current
        if (newUser) setLoading(true)
        setTimeout(async () => {
          await loadProfile(s)
          if (newUser && active) setLoading(false)
        }, 0)
      }
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const refreshProfile = useCallback(() => loadProfile(session), [loadProfile, session])

  return (
    <AuthContext.Provider value={{ session, profile, loading, error, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth outside AuthProvider")
  return ctx
}

/** Guard: logged in (else /connexion) and, unless onboarding, with a profile (else /bienvenue); admin pages need is_admin. */
export function Protected({
  children,
  onboarding = false,
  admin = false,
}: {
  children: ReactNode
  onboarding?: boolean
  /** Admin-only page: non-admins are sent back to /tournois. */
  admin?: boolean
}) {
  const { session, profile, loading, error, refreshProfile } = useAuth()
  if (loading) return <AppShell bare><Loading /></AppShell>
  if (!session) return <Navigate to="/connexion" replace />
  if (error)
    return (
      <AppShell bare>
        <ErrorBox message={`Profil indisponible : ${error}`} onRetry={refreshProfile} />
      </AppShell>
    )
  if (!onboarding && !profile) return <Navigate to="/bienvenue" replace />
  if (onboarding && profile) return <Navigate to="/tournois" replace />
  if (profile?.deleted_at)
    return (
      <AppShell bare>
        <ErrorBox message="Ce compte a été supprimé." />
        <LineButton onClick={() => supabase.auth.signOut()} className="mt-4 w-full">
          Se déconnecter
        </LineButton>
      </AppShell>
    )
  if (admin && !profile?.is_admin) return <Navigate to="/tournois" replace />
  return <>{children}</>
}
