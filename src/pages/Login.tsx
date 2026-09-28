import { useState, type FormEvent } from "react"
import { Navigate } from "react-router-dom"
import { ArrowRight } from "lucide-react"

import { AppShell, Box, ChalkButton, ErrorBox, Field, PageTitle } from "@/components/court/AppShell"
import { useAuth } from "@/lib/auth"
import { supabase } from "@/lib/supabase"

export default function Login() {
  const { session, loading } = useAuth()
  const [email, setEmail] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!loading && session) return <Navigate to="/tournois" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + "/tournois" },
    })
    setSending(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <AppShell bare>
      <PageTitle eyebrow="Connexion">Entre sur le court</PageTitle>

      {sent ? (
        <Box className="px-5 py-6">
          <p className="font-display text-2xl">Regarde tes mails</p>
          <p className="mt-2 text-chalk/90">
            Un lien de connexion vient d'être envoyé à <strong>{email}</strong>. Ouvre-le sur cet appareil.
          </p>
          <button onClick={() => setSent(false)} className="mt-4 min-h-11 text-sm underline underline-offset-4">
            Changer d'adresse
          </button>
        </Box>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <p className="text-chalk/90">Pas de mot de passe : on t'envoie un lien par e-mail.</p>
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
          {error && <ErrorBox message={error} />}
          <ChalkButton type="submit" disabled={sending} className="w-full">
            {sending ? "Envoi…" : "Recevoir le lien"}
            <ArrowRight className="size-5" />
          </ChalkButton>
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
