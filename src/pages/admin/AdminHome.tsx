import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ChevronRight } from "lucide-react"

import { AppShell, Box, ChalkButton, ErrorBox, Field, Loading, PageTitle, Tag } from "@/components/court/AppShell"
import { formatDate, groupTournaments, hasDraw, statusLabel, supabase, type WithDraw } from "@/lib/supabase"
import { Flag } from "@/components/court/PlayerLabel"
import { suggestCountry } from "@/lib/flags"
import { CATEGORIES, suggestCategory, type Category } from "@/lib/scoring"
import { suggestTheme, THEME_GROUPS, THEMES } from "@/lib/theme"

/** Early rounds are numbered from the start, the last 4 are always 8es → Finale (32 draw: 1er tour, 8es, …). */
const EARLY_ROUNDS = ["1er tour", "2e tour", "3e tour"]
const LAST_ROUNDS = ["8es de finale", "Quarts", "Demies", "Finale"]
const roundNames = (count: number) => [...EARLY_ROUNDS.slice(0, Math.max(0, count - 4)), ...LAST_ROUNDS.slice(-count)]
const DRAW_SIZES = [16, 32, 64, 128]
const DAY = 24 * 3600 * 1000

export const selectClass =
  "h-12 w-full rounded-[2px] border-2 border-chalk/90 bg-brick/25 px-3 text-base text-chalk focus:bg-brick/40 focus:outline-none [&>option]:text-ink"

/** Tournament style: "" = the player's own surface, else a theme id. */
export function ThemeSelect({ value, onChange, disabled, bare = false }: { value: string; onChange: (v: string) => void; disabled?: boolean; bare?: boolean }) {
  return (
    <label className="block">
      <span className={bare ? "sr-only" : "micro-label mb-2"}>Style</span>
      <select className={selectClass} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">Aucun (choix du joueur)</option>
        {THEME_GROUPS.map((g) => (
          <optgroup key={g.id} label={g.label}>
            {THEMES.filter((t) => t.group === g.id).map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

/** Tournament category: weighs its season points (×2 / ×3 / ×5 / ×8). */
export function CategorySelect({ value, onChange, disabled, bare = false }: { value: Category; onChange: (v: Category) => void; disabled?: boolean; bare?: boolean }) {
  return (
    <label className="block">
      <span className={bare ? "sr-only" : "micro-label mb-2"}>Catégorie</span>
      <select className={selectClass} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as Category)}>
        {CATEGORIES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label} · points ×{c.mult}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Host country: 3 letters like the players' (FRA, SUI…), the flag next to the tournament's name. */
export function CountryField({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="micro-label mb-2">Pays</span>
      <span className="flex items-center gap-3">
        <input
          className="h-12 w-28 rounded-[2px] border-2 border-chalk/90 bg-brick/25 px-3 text-base text-chalk uppercase placeholder:text-chalk/50 focus:bg-brick/40 focus:outline-none"
          value={value}
          disabled={disabled}
          maxLength={3}
          pattern="[A-Za-z]{3}"
          placeholder="FRA"
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
        <Flag code={value.length === 3 ? value : null} className="text-2xl" />
      </span>
      <span className="mt-1.5 block text-xs text-chalk/75">Code à 3 lettres (FRA, SUI, USA…) : le drapeau à côté du nom.</span>
    </label>
  )
}

/** Audit trail for direct table writes (the RPCs log themselves). */
export async function logAdmin(action: string, payload: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession()
  await supabase.from("admin_log").insert({ admin_id: data.session?.user.id, action, payload })
}

export default function AdminHome() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<WithDraw[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const [name, setName] = useState("")
  const [tour, setTour] = useState<"ATP" | "WTA">("ATP")
  const [drawSize, setDrawSize] = useState(128)
  const [startsAt, setStartsAt] = useState("")
  const [externalId, setExternalId] = useState("")
  // Style follows the name until the admin picks one.
  const [theme, setThemeChoice] = useState<string | null>(null)
  const style = theme ?? suggestTheme(name) ?? ""
  // Category follows the style until the admin picks one.
  const [categoryChoice, setCategory] = useState<Category | null>(null)
  const category = categoryChoice ?? suggestCategory(style)
  // Country (flag) follows the name until the admin types one.
  const [countryChoice, setCountry] = useState<string | null>(null)
  const country = countryChoice ?? suggestCountry(name) ?? ""
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)
  const testT = rows?.find((t) => t.test)

  useEffect(() => {
    let active = true
    setError(null)
    supabase
      .from("tournaments")
      .select("*, players(count)")
      .order("starts_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return
        if (error) setError(error.message)
        else setRows(data as WithDraw[])
      })
    return () => {
      active = false
    }
  }, [reload])

  async function create(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    const start = new Date(startsAt)
    const { data: t, error } = await supabase
      .from("tournaments")
      .insert({ name: name.trim(), tour, draw_size: drawSize, starts_at: start.toISOString(), external_id: externalId.trim() || null, theme: style || null, category, country: country || null })
      .select("id")
      .single()
    if (error) {
      setFormError(error.message)
      setSaving(false)
      return
    }
    const count = Math.round(Math.log2(drawSize))
    const rounds = roundNames(count).map((roundName, i) => ({
      tournament_id: t.id,
      idx: i + 1,
      name: roundName,
      locks_at: new Date(start.getTime() + i * 2 * DAY).toISOString(),
    }))
    const r = await supabase.from("rounds").insert(rounds)
    await logAdmin("create_tournament", { id: t.id, name: name.trim() })
    setSaving(false)
    if (r.error) {
      setFormError(`Tournoi créé, mais les tours n'ont pas pu être générés : ${r.error.message}`)
      setReload((n) => n + 1)
      return
    }
    navigate(`/admin/tournois/${t.id}`)
  }

  /** Fresh "Shanghai (test)": only admins see it, no season points (migration 0013). */
  async function resetTest() {
    if (testT && !confirm("Réinitialiser le tournoi test ? Ses inscriptions, choix et résultats seront supprimés.")) return
    setResetting(true)
    setTestError(null)
    const { data: id, error } = await supabase.rpc("admin_reset_test_tournament")
    setResetting(false)
    if (error) return setTestError(error.message)
    navigate(`/tournois/${id}`)
  }

  return (
    <AppShell>
      <PageTitle eyebrow="Administration">Admin</PageTitle>

      <section className="mb-10">
        {error && <ErrorBox message={error} onRetry={() => setReload((n) => n + 1)} />}
        {!rows && !error && <Loading />}
        {rows && rows.length === 0 && <p className="py-4 text-chalk/85">Aucun tournoi pour l'instant.</p>}
        {rows &&
          groupTournaments(rows, true).map(({ title, list }) => (
            <div key={title} className="mb-8 last:mb-0">
              <h2 className="micro-label mb-3">{title}</h2>
              <div className="space-y-3">
                {list.map((t) => (
                  <Link key={t.id} to={`/admin/tournois/${t.id}`} className="block">
                    <Box className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-chalk/10">
                      <div className="min-w-0 flex-1">
                        <Tag tone={t.status === "draft" ? "out" : "neutral"}>{statusLabel(t.status, hasDraw(t))}</Tag>
                        {t.test && <span className="ml-2"><Tag tone="alert">Test</Tag></span>}
                        <h3 className="mt-2 font-display text-2xl leading-tight">
                          <Flag code={t.country} className="mr-2" />
                          {t.name}
                        </h3>
                        <p className="mt-1 text-sm text-chalk/85">
                          {t.tour} · tableau {t.draw_size} · {formatDate(t.starts_at)}
                        </p>
                      </div>
                      <ChevronRight className="size-5 shrink-0 text-chalk/80" />
                    </Box>
                  </Link>
                ))}
              </div>
            </div>
          ))}
      </section>

      <section className="mb-10">
        <h2 className="micro-label mb-3">Tournoi test</h2>
        <Box className="space-y-3 px-4 py-5">
          <p className="text-sm text-chalk/90">
            Shanghai, tableau 32, inscriptions ouvertes, 1er tour verrouillé dans 24 h puis un tour par jour. Visible
            par les admins seulement, sans points de saison.
          </p>
          {testError && <ErrorBox message={testError} />}
          <div className="flex flex-wrap gap-3">
            <ChalkButton type="button" onClick={resetTest} disabled={resetting}>
              {resetting ? "Préparation…" : testT ? "Réinitialiser le tournoi test" : "Créer le tournoi test"}
            </ChalkButton>
            {testT && (
              <Link to={`/tournois/${testT.id}`} className="self-center text-sm font-bold underline underline-offset-4">
                Ouvrir
              </Link>
            )}
          </div>
        </Box>
      </section>

      <section>
        <h2 className="micro-label mb-3">Nouveau tournoi</h2>
        <Box className="px-4 py-5">
          <form onSubmit={create} className="space-y-4">
            <Field label="Nom" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Roland-Garros 2027" />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="micro-label mb-2">Circuit</span>
                <select className={selectClass} value={tour} onChange={(e) => setTour(e.target.value as "ATP" | "WTA")}>
                  <option value="ATP">ATP</option>
                  <option value="WTA">WTA</option>
                </select>
              </label>
              <label className="block">
                <span className="micro-label mb-2">Tableau</span>
                <select className={selectClass} value={drawSize} onChange={(e) => setDrawSize(Number(e.target.value))}>
                  {DRAW_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n} joueurs
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Field
              label="Début"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
              hint="Verrouillage du 1er tour ; les suivants tous les 2 jours (modifiable ensuite)."
            />
            <ThemeSelect value={style} onChange={setThemeChoice} />
            <CategorySelect value={category} onChange={setCategory} />
            <CountryField value={country} onChange={setCountry} />
            <Field label="ID Tennis API (ex. 21362 = Paris Masters)" value={externalId} onChange={(e) => setExternalId(e.target.value)} />
            {formError && <ErrorBox message={formError} />}
            <ChalkButton type="submit" disabled={saving} className="w-full">
              {saving ? "Création…" : "Créer le tournoi"}
            </ChalkButton>
          </form>
        </Box>
      </section>
    </AppShell>
  )
}
