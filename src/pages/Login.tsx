import { useState, type FormEvent } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { ArrowRight } from "lucide-react"

import { AppShell, Box, ChalkButton, ErrorBox, Field, PageTitle, PasswordField } from "@/components/court/AppShell"
import { useAuth } from "@/lib/auth"
import { authErrorFr } from "@/lib/authErrors"
import { supabase } from "@/lib/supabase"

type Mode = "signin" | "signup"

export default function Login() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Message shown instead of the form (confirmation mail, reset mail). */
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null)

  if (!loading && session) return <Navigate to="/tournois" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (mode === "signup" && password.length < 8) {
      setError("Mot de passe trop court (8 caractères minimum)")
      return
    }
    setBusy(true)
    const creds = { email: email.trim(), password }
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword(creds)
      setBusy(false)
      if (error) return setError(authErrorFr(error))
      navigate("/tournois", { replace: true })
    } else {
      const { data, error } = await supabase.auth.signUp({
        ...creds,
        options: { emailRedirectTo: window.location.origin + "/tournois" },
      })
      setBusy(false)
      if (error) return setError(authErrorFr(error))
      if (!data.session) {
        setNotice({ title: "Presque fini", body: "Vérifie ta boîte mail pour confirmer ton compte." })
        return
      }
      navigate("/tournois", { replace: true })
    }
  }

  async function forgot() {
    setError(null)
    if (!email.trim()) {
      setError("Saisis ton adresse e-mail, puis clique à nouveau sur « Mot de passe oublié ? »")
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + "/nouveau-mot-de-passe",
    })
    setBusy(false)
    if (error) return setError(authErrorFr(error))
    setNotice({
      title: "Regarde tes mails",
      body: `Si un compte existe pour ${email.trim()}, un lien pour choisir un nouveau mot de passe vient d'être envoyé.`,
    })
  }

  function switchMode() {
    setMode((m) => (m === "signin" ? "signup" : "signin"))
    setError(null)
  }

  const signup = mode === "signup"

  return (
    <AppShell bare>
      <PageTitle eyebrow={signup ? "Inscription" : "Connexion"}>
        {signup ? "Crée ton compte" : "Entre sur le court"}
      </PageTitle>

      {notice ? (
        <Box className="px-5 py-6">
          <p className="font-display text-2xl">{notice.title}</p>
          <p className="mt-2 text-chalk/90">{notice.body}</p>
          <button
            onClick={() => {
              setNotice(null)
              setMode("signin")
            }}
            className="mt-4 min-h-11 text-sm underline underline-offset-4"
          >
            Retour à la connexion
          </button>
        </Box>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <Field
            label="Adresse e-mail"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="toi@exemple.fr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div>
            <PasswordField
              label="Mot de passe"
              required
              minLength={signup ? 8 : undefined}
              autoComplete={signup ? "new-password" : "current-password"}
              hint={signup ? "8 caractères minimum" : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {!signup && (
              <button
                type="button"
                onClick={forgot}
                disabled={busy}
                className="mt-1 min-h-11 text-sm underline underline-offset-4 disabled:opacity-60"
              >
                Mot de passe oublié ?
              </button>
            )}
          </div>
          {error && <ErrorBox message={error} />}
          <ChalkButton type="submit" disabled={busy} className="w-full">
            {busy ? "Un instant…" : signup ? "Créer mon compte" : "Se connecter"}
            <ArrowRight className="size-5" />
          </ChalkButton>
          <p className="text-center text-sm text-chalk/90">
            {signup ? "Déjà un compte ?" : "Pas encore de compte ?"}{" "}
            <button type="button" onClick={switchMode} className="min-h-11 font-bold underline underline-offset-4">
              {signup ? "Se connecter" : "Créer un compte"}
            </button>
          </p>
        </form>
      )}

      <section className="mt-10 border-t-2 border-chalk/60 pt-5 text-sm leading-relaxed text-chalk/90">
        <h2 className="micro-label mb-2">Confidentialité</h2>
        <p>
          Nous collectons ton e-mail (pour te connecter), et à l'inscription ton classement, ta région, ta ville et ton
          pays (pour situer le niveau et l'origine des joueurs du tournoi). Ces données restent privées : seul ton pseudo est
          public. Tu peux supprimer ton compte à tout moment depuis ton profil ; tes données personnelles sont alors
          effacées et tes participations passées restent affichées comme « utilisateur supprimé ».
        </p>
      </section>
    </AppShell>
  )
}
