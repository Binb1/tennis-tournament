import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowRight } from "lucide-react"

import { AppShell, ChalkButton, ErrorBox, Loading, PageTitle, PasswordField } from "@/components/court/AppShell"
import { useAuth } from "@/lib/auth"
import { authError } from "@/lib/authErrors"
import { t } from "@/lib/i18n"
import { supabase } from "@/lib/supabase"

/** Link errors come back in the URL hash (e.g. an expired recovery link). */
function linkError(): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1))
  return params.get("error_description") || params.get("error")
}

/** Landing page of the "Mot de passe oublié" e-mail: the recovery session lets the user set a new password. */
export default function NewPassword() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [recovery, setRecovery] = useState(false)
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [badLink] = useState(linkError)

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const ready = recovery || !!session

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError(t("login.passwordTooShort"))
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(authError(error))
    navigate("/tournois", { replace: true })
  }

  return (
    <AppShell bare>
      <PageTitle eyebrow={t("login.newPasswordEyebrow")}>{t("login.newPasswordTitle")}</PageTitle>
      {loading && !ready ? (
        <Loading />
      ) : !ready ? (
        <div className="space-y-4">
          <ErrorBox message={badLink ? t("login.linkExpired") : t("login.openLink")} />
          <Link to="/connexion" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">
            {t("login.backToLogin")}
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <PasswordField
            label={t("login.newPassword")}
            required
            minLength={8}
            autoComplete="new-password"
            hint={t("login.passwordHint")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <ErrorBox message={error} />}
          <ChalkButton type="submit" disabled={busy} className="w-full">
            {busy ? t("login.wait") : t("login.save")}
            <ArrowRight className="size-5" />
          </ChalkButton>
        </form>
      )}
    </AppShell>
  )
}
