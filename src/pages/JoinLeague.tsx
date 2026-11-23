import { useEffect, useState } from "react"
import { Link, Navigate, useNavigate, useParams } from "react-router-dom"

import { AppShell, ChalkButton, ErrorBox, LineButton, Loading, PageTitle } from "@/components/court/AppShell"
import { track } from "@/lib/analytics"
import { useAuth } from "@/lib/auth"
import { dbError, t } from "@/lib/i18n"
import { clearPendingInvite, savePendingInvite } from "@/lib/leagues"
import { supabase } from "@/lib/supabase"

type Preview = { id: string; name: string; owner: string; members: number; is_member: boolean }

/**
 * /rejoindre/:code, the invite link (and what the QR code opens). Readable logged out: the league's name and owner,
 * then login. The code is kept on the device meanwhile (lib/leagues homePath), so sign-up / login lands back here.
 */
export default function JoinLeague() {
  const { code = "" } = useParams()
  const { session, profile, loading } = useAuth()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const uid = session?.user.id

  useEffect(() => {
    if (loading) return
    let active = true
    supabase.rpc("league_by_code", { p_code: code }).then(({ data, error }) => {
      if (!active) return
      if (error) setError(error.message)
      else setPreview(((data as Preview[] | null) ?? [])[0] ?? null)
    })
    return () => {
      active = false
    }
  }, [code, loading, uid])

  // Logged in: the invite is handled here, no need to come back to it.
  useEffect(() => {
    if (session && profile) clearPendingInvite()
  }, [session, profile])

  if (session && !loading && !profile) {
    savePendingInvite(code)
    return <Navigate to="/bienvenue" replace />
  }

  async function join() {
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc("join_league", { p_code: code })
    setBusy(false)
    if (error) return setError(dbError(error.message))
    track("league_joined", { via: "link" })
    navigate(`/ligues/${data as string}`, { replace: true })
  }

  function login() {
    savePendingInvite(code)
    navigate("/connexion")
  }

  return (
    <AppShell bare={!session}>
      {(loading || preview === undefined) && !error && <Loading />}
      {error && <ErrorBox message={error} />}
      {preview === null && (
        <>
          <PageTitle eyebrow={t("leagues.inviteEyebrow")}>{code.toUpperCase()}</PageTitle>
          <p className="mb-6 border-2 border-dashed border-chalk/60 px-4 py-6 text-center text-chalk/90">{t("leagues.badCode")}</p>
          {session && (
            <Link to="/ligues" className="underline underline-offset-4">
              {t("leagues.back")}
            </Link>
          )}
        </>
      )}
      {preview && (
        <>
          <PageTitle eyebrow={t("leagues.inviteEyebrow")}>{preview.name}</PageTitle>
          <p className="-mt-2 mb-6 text-chalk/90">
            {t("leagues.invitedBy", { owner: preview.owner })} · {t("leagues.members", { count: preview.members })}
          </p>
          {preview.is_member ? (
            <>
              <p className="mb-4 text-sm text-chalk/85">{t("leagues.alreadyIn")}</p>
              <LineButton onClick={() => navigate(`/ligues/${preview.id}`, { replace: true })} className="w-full">
                {t("leagues.open")}
              </LineButton>
            </>
          ) : session ? (
            <ChalkButton onClick={join} disabled={busy} className="w-full">
              {busy ? t("leagues.joining") : t("leagues.join")}
            </ChalkButton>
          ) : (
            <>
              <ChalkButton onClick={login} className="w-full">
                {t("leagues.loginToJoin")}
              </ChalkButton>
              <p className="mt-3 text-sm text-chalk/85">{t("leagues.loginHint")}</p>
            </>
          )}
        </>
      )}
    </AppShell>
  )
}
