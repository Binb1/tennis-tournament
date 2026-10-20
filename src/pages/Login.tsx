import { useState, type FormEvent } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { ArrowRight } from "lucide-react"

import { AppShell, Box, ChalkButton, ErrorBox, Field, PageTitle, PasswordField } from "@/components/court/AppShell"
import { useAuth } from "@/lib/auth"
import { authError } from "@/lib/authErrors"
import { t } from "@/lib/i18n"
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
      setError(t("login.passwordTooShort"))
      return
    }
    setBusy(true)
    const creds = { email: email.trim(), password }
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword(creds)
      setBusy(false)
      if (error) return setError(authError(error))
      navigate("/tournois", { replace: true })
    } else {
      const { data, error } = await supabase.auth.signUp({
        ...creds,
        options: { emailRedirectTo: window.location.origin + "/tournois" },
      })
      setBusy(false)
      if (error) return setError(authError(error))
      if (!data.session) {
        setNotice({ title: t("login.almostDoneTitle"), body: t("login.almostDoneBody") })
        return
      }
      navigate("/tournois", { replace: true })
    }
  }

  async function forgot() {
    setError(null)
    if (!email.trim()) {
      setError(t("login.forgotNeedsEmail"))
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + "/nouveau-mot-de-passe",
    })
    setBusy(false)
    if (error) return setError(authError(error))
    setNotice({
      title: t("login.resetSentTitle"),
      body: t("login.resetSentBody", { email: email.trim() }),
    })
  }

  function switchMode() {
    setMode((m) => (m === "signin" ? "signup" : "signin"))
    setError(null)
  }

  const signup = mode === "signup"

  return (
    <AppShell bare>
      <PageTitle eyebrow={signup ? t("login.signupEyebrow") : t("login.signinEyebrow")}>
        {signup ? t("login.signupTitle") : t("login.signinTitle")}
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
            {t("login.backToLogin")}
          </button>
        </Box>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <Field
            label={t("login.email")}
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder={t("login.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div>
            <PasswordField
              label={t("login.password")}
              required
              minLength={signup ? 8 : undefined}
              autoComplete={signup ? "new-password" : "current-password"}
              hint={signup ? t("login.passwordHint") : undefined}
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
                {t("login.forgot")}
              </button>
            )}
          </div>
          {error && <ErrorBox message={error} />}
          <ChalkButton type="submit" disabled={busy} className="w-full">
            {busy ? t("login.wait") : signup ? t("login.createAccount") : t("login.signIn")}
            <ArrowRight className="size-5" />
          </ChalkButton>
          <p className="text-center text-sm text-chalk/90">
            {signup ? t("login.haveAccount") : t("login.noAccount")}{" "}
            <button type="button" onClick={switchMode} className="min-h-11 font-bold underline underline-offset-4">
              {signup ? t("login.signIn") : t("login.switchToSignup")}
            </button>
          </p>
        </form>
      )}

      <section className="mt-10 border-t-2 border-chalk/60 pt-5 text-sm leading-relaxed text-chalk/90">
        <h2 className="micro-label mb-2">{t("login.privacyTitle")}</h2>
        <p>{t("login.privacyBody")}</p>
      </section>
    </AppShell>
  )
}
