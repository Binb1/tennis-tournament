import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRight } from "lucide-react"

import { AppShell, ChalkButton, ErrorBox, Field, PageTitle } from "@/components/court/AppShell"
import { useAuth } from "@/lib/auth"
import { supabase } from "@/lib/supabase"
import { HandleField, parseSocials } from "@/components/court/Socials"

export default function Welcome() {
  const { session, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: "", ranking: "", region: "", city: "", country: "France", x: "", instagram: "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!session) return
    const username = form.username.trim()
    if (username.length < 3 || username.length > 30) {
      setError("Le pseudo doit faire entre 3 et 30 caractères.")
      return
    }
    const socials = parseSocials(form)
    if (!socials.ok) {
      setError(socials.error)
      return
    }
    setSaving(true)
    setError(null)
    const id = session.user.id
    // Handles are only sent when filled (new rows default to null).
    const handles = Object.fromEntries(Object.entries(socials.value).filter(([, v]) => v))
    const { error: e1 } = await supabase.from("profiles").upsert({ id, username, ...handles })
    if (e1) {
      setSaving(false)
      setError(e1.code === "23505" ? "Ce pseudo est déjà pris, choisis-en un autre." : e1.message)
      return
    }
    const { error: e2 } = await supabase.from("profiles_private").upsert({
      id,
      email: session.user.email,
      ranking: form.ranking.trim() || null,
      region: form.region.trim() || null,
      city: form.city.trim() || null,
      country: form.country.trim() || "France",
    })
    if (e2) {
      setSaving(false)
      setError(e2.message)
      return
    }
    await refreshProfile()
    navigate("/tournois", { replace: true })
  }

  return (
    <AppShell bare>
      <PageTitle eyebrow="Première visite">Bienvenue</PageTitle>
      <form onSubmit={submit} className="space-y-5">
        <Field
          label="Pseudo"
          required
          minLength={3}
          maxLength={30}
          autoComplete="username"
          value={form.username}
          onChange={set("username")}
          hint="Public, visible dans les classements."
        />
        <div className="grid grid-cols-2 gap-4">
          <HandleField label="X (Twitter)" placeholder="facultatif" value={form.x} onChange={set("x")} />
          <HandleField label="Instagram" placeholder="facultatif" value={form.instagram} onChange={set("instagram")} />
        </div>
        <p className="-mt-3 text-xs text-chalk/75">Facultatif et public : un lien apparaît à côté de ton pseudo.</p>
        <div className="border-t-2 border-chalk/60 pt-5">
          <p className="mb-4 text-sm text-chalk/85">Privé, visible par toi seul.</p>
          <div className="space-y-5">
            <Field label="Classement" placeholder="ex. 15/2, NC" value={form.ranking} onChange={set("ranking")} />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Région" value={form.region} onChange={set("region")} />
              <Field label="Ville" autoComplete="address-level2" value={form.city} onChange={set("city")} />
            </div>
            <Field label="Pays" autoComplete="country-name" value={form.country} onChange={set("country")} />
          </div>
        </div>
        {error && <ErrorBox message={error} />}
        <ChalkButton type="submit" disabled={saving} className="w-full">
          {saving ? "Enregistrement…" : "Entrer sur le court"}
          <ArrowRight className="size-5" />
        </ChalkButton>
      </form>
    </AppShell>
  )
}
