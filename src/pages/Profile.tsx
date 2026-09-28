import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ChevronRight } from "lucide-react"

import { AppShell, Box, ChalkButton, ErrorBox, LineButton, Loading, PageTitle, ResultTag, Tag } from "@/components/court/AppShell"
import { useAuth } from "@/lib/auth"
import {
  displayName,
  fetchLastPicks,
  fetchWinners,
  formatDate,
  supabase,
  type EntryStatus,
  type LastPick,
  type Tournament,
} from "@/lib/supabase"
import { MyState } from "@/pages/Tournaments"
import { HandleField, SocialLinks, parseSocials } from "@/components/court/Socials"

/** Public X / Instagram handles: shown as links, editable in place. */
function SocialsEditor() {
  const { session, profile, refreshProfile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ x: "", instagram: "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasAny = !!(profile?.x_handle || profile?.instagram_handle)

  function open() {
    setForm({ x: profile?.x_handle ?? "", instagram: profile?.instagram_handle ?? "" })
    setError(null)
    setEditing(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!session) return
    const parsed = parseSocials(form)
    if (!parsed.ok) return setError(parsed.error)
    setSaving(true)
    setError(null)
    const { error } = await supabase.from("profiles").update(parsed.value).eq("id", session.user.id)
    if (error) {
      setSaving(false)
      return setError(error.message)
    }
    await refreshProfile()
    setSaving(false)
    setEditing(false)
  }

  if (!editing)
    return (
      <div className="mt-2 flex flex-wrap items-center gap-x-5">
        <SocialLinks p={profile} />
        <button onClick={open} className="min-h-11 text-sm text-chalk/85 underline underline-offset-4 hover:text-chalk">
          {hasAny ? "Modifier mes réseaux" : "Ajouter X / Instagram"}
        </button>
      </div>
    )

  return (
    <form onSubmit={save} className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <HandleField label="X (Twitter)" placeholder="facultatif" value={form.x} onChange={(e) => setForm({ ...form, x: e.target.value })} />
        <HandleField
          label="Instagram"
          placeholder="facultatif"
          value={form.instagram}
          onChange={(e) => setForm({ ...form, instagram: e.target.value })}
        />
      </div>
      <p className="text-xs text-chalk/75">Public : un lien apparaît à côté de ton pseudo dans les classements. Laisse vide pour retirer.</p>
      {error && <ErrorBox message={error} />}
      <div className="grid grid-cols-2 gap-3">
        <LineButton type="button" onClick={() => setEditing(false)} disabled={saving}>
          Annuler
        </LineButton>
        <ChalkButton type="submit" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </ChalkButton>
      </div>
    </form>
  )
}

type Row = { id: string; tournaments: Tournament | null }

export default function Profile() {
  const { session, profile } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [statuses, setStatuses] = useState<Record<string, EntryStatus>>({})
  const [winners, setWinners] = useState<Set<string>>(new Set())
  const [lastPicks, setLastPicks] = useState<Record<string, LastPick>>({})
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    const uid = session!.user.id
    Promise.all([
      supabase.from("entries").select("id, tournaments(*)").eq("user_id", uid).order("joined_at", { ascending: false }),
      supabase.from("entry_status").select("*").eq("user_id", uid),
    ]).then(async ([e, s]) => {
      if (e.error || s.error) return setError((e.error ?? s.error)!.message)
      const rows = e.data as unknown as Row[]
      const finished = rows.filter((r) => r.tournaments?.status === "finished").map((r) => r.tournaments!.id)
      try {
        const [w, p] = await Promise.all([fetchWinners(finished), fetchLastPicks(rows.map((r) => r.id))])
        setWinners(w)
        setLastPicks(p)
      } catch (err) {
        return setError((err as Error).message)
      }
      setRows(rows)
      setStatuses(Object.fromEntries((s.data as EntryStatus[]).map((x) => [x.entry_id, x])))
    })
  }, [session])

  async function signOut() {
    await supabase.auth.signOut()
    navigate("/", { replace: true })
  }

  async function deleteAccount() {
    setDeleting(true)
    setDeleteError(null)
    const { error } = await supabase.rpc("delete_my_account")
    if (error) {
      setDeleting(false)
      setDeleteError(error.message)
      return
    }
    await signOut()
  }

  return (
    <AppShell>
      <PageTitle eyebrow="Profil">{displayName(profile)}</PageTitle>
      <p className="-mt-2 text-sm text-chalk/85">{session?.user.email}</p>
      <div className="mb-8">
        <SocialsEditor />
      </div>

      <section className="mb-10">
        <h2 className="micro-label mb-3">Mes tournois</h2>
        {error && <ErrorBox message={error} />}
        {!rows && !error && <Loading />}
        {rows && rows.length === 0 && (
          <p className="border-2 border-dashed border-chalk/60 px-4 py-6 text-center text-chalk/90">
            Aucun tournoi pour l'instant. <Link to="/tournois" className="inline-block py-3 underline underline-offset-4">Voir les tournois</Link>
          </p>
        )}
        {rows && rows.length > 0 && (
          <ul className="border-2 border-chalk/90">
            {rows.map((r) => {
              const t = r.tournaments
              const s = statuses[r.id]
              const last = lastPicks[r.id]
              if (!t) return null
              return (
                <li key={r.id} className="border-t-2 border-chalk/50 first:border-t-0">
                  <Link to={`/tournois/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-chalk/10">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{t.name}</p>
                      <p className="text-xs text-chalk/80">
                        {formatDate(t.starts_at)}
                        {s && s.rounds_survived > 0 && ` · ${s.rounds_survived} ${s.rounds_survived > 1 ? "tours passés" : "tour passé"}`}
                      </p>
                      {last && (
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
                          <span className="text-chalk/85">Ton choix · {last.roundName} :</span>
                          <span className="font-bold">{last.player}</span>
                          <ResultTag result={last.result} />
                        </p>
                      )}
                    </div>
                    {s ? <MyState status={t.status} me={s} winner={winners.has(r.id)} /> : <Tag tone="neutral">Inscrit</Tag>}
                    <ChevronRight className="size-4 shrink-0 text-chalk/70" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <LineButton onClick={signOut} className="w-full">
        Se déconnecter
      </LineButton>

      <section className="mt-12 border-t-2 border-chalk/60 pt-6">
        {!confirming ? (
          <button onClick={() => setConfirming(true)} className="min-h-11 text-sm font-medium underline underline-offset-4">
            Supprimer mon compte
          </button>
        ) : (
          <Box className="border-chalk bg-brick/60 px-4 py-4">
            <p className="font-display text-xl">Supprimer ton compte ?</p>
            <p className="mt-2 text-sm text-chalk/90">
              Tes données personnelles (e-mail, classement, région, ville, pays) sont effacées. Tes participations restent
              visibles sous le nom « utilisateur supprimé ». Cette action est définitive.
            </p>
            {deleteError && (
              <div className="mt-3">
                <ErrorBox message={deleteError} />
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <LineButton onClick={() => setConfirming(false)} disabled={deleting}>
                Annuler
              </LineButton>
              <button
                onClick={deleteAccount}
                disabled={deleting}
                className="min-h-11 rounded-[2px] bg-ink px-4 text-[13px] font-bold tracking-[0.14em] text-chalk uppercase [font-stretch:85%] hover:bg-ink/85 disabled:opacity-60"
              >
                {deleting ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </Box>
        )}
      </section>
    </AppShell>
  )
}
