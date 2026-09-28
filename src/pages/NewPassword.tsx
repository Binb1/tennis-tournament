import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowRight } from "lucide-react"

import { AppShell, ChalkButton, ErrorBox, Loading, PageTitle, PasswordField } from "@/components/court/AppShell"
import { useAuth } from "@/lib/auth"
import { authErrorFr } from "@/lib/authErrors"
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
    if (password.length < 8) return setError("Mot de passe trop court (8 caractères minimum)")
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(authErrorFr(error))
    navigate("/tournois", { replace: true })
  }

  return (
    <AppShell bare>
      <PageTitle eyebrow="Mot de passe oublié">Nouveau mot de passe</PageTitle>
      {loading && !ready ? (
        <Loading />
      ) : !ready ? (
        <div className="space-y-4">
          <ErrorBox message={badLink ? "Ce lien n'est plus valide. Demande un nouveau lien depuis la page de connexion." : "Ouvre le lien reçu par e-mail pour choisir un nouveau mot de passe."} />
          <Link to="/connexion" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">
            Retour à la connexion
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <PasswordField
            label="Nouveau mot de passe"
            required
            minLength={8}
            autoComplete="new-password"
            hint="8 caractères minimum"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <ErrorBox message={error} />}
          <ChalkButton type="submit" disabled={busy} className="w-full">
            {busy ? "Un instant…" : "Enregistrer"}
            <ArrowRight className="size-5" />
          </ChalkButton>
        </form>
      )}
    </AppShell>
  )
}
