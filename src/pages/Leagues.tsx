import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ChevronRight } from "lucide-react"

import { AppShell, Box, ChalkButton, ErrorBox, Field, LineButton, Loading, PageTitle } from "@/components/court/AppShell"
import { track } from "@/lib/analytics"
import { useAuth } from "@/lib/auth"
import { dbError, t } from "@/lib/i18n"
import { fetchMyLeagues, MAX_LEAGUES, type League } from "@/lib/leagues"
import { supabase } from "@/lib/supabase"

/** My leagues (migration 0020): the list, then create one or join one with a code. */
export default function Leagues() {
  const { session } = useAuth()
  const uid = session?.user.id
  const navigate = useNavigate()
  const [leagues, setLeagues] = useState<League[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    setError(null)
    fetchMyLeagues()
      .then((l) => active && setLeagues(l))
      .catch((e: Error) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [reload])

  const full = (leagues?.length ?? 0) >= MAX_LEAGUES

  return (
    <AppShell>
      <PageTitle eyebrow={t("leagues.eyebrow")}>{t("leagues.title")}</PageTitle>
      <p className="-mt-2 mb-6 text-sm text-chalk/85">{t("leagues.intro", { max: MAX_LEAGUES })}</p>

      {error && <ErrorBox message={error} onRetry={() => setReload((n) => n + 1)} />}
      {!leagues && !error && <Loading />}

      {leagues && leagues.length === 0 && (
        <p className="mb-6 border-2 border-dashed border-chalk/60 px-4 py-6 text-center text-chalk/90">{t("leagues.none")}</p>
      )}

      {leagues && leagues.length > 0 && (
        <ul className="mb-8 space-y-3">
          {leagues.map((l) => (
            <li key={l.id}>
              <Link to={`/ligues/${l.id}`} className="flex min-h-16 items-center gap-3 border-2 border-chalk/90 px-4 py-3 hover:bg-chalk/10">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-xl leading-tight">{l.name}</span>
                  <span className="text-xs text-chalk/80">
                    {t("leagues.members", { count: l.league_members.length })}
                    {l.owner_id === uid && ` · ${t("leagues.owner")}`}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {leagues && full && <p className="border-l-4 border-chalk bg-brick/40 px-4 py-3 text-sm">{t("leagues.full", { max: MAX_LEAGUES })}</p>}

      {leagues && !full && (
        <div className="space-y-6">
          <JoinForm onJoined={(id) => navigate(`/ligues/${id}`)} />
          <CreateForm onCreated={(id) => navigate(`/ligues/${id}`)} />
        </div>
      )}
    </AppShell>
  )
}

function JoinForm({ onJoined }: { onJoined: (id: string) => void }) {
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc("join_league", { p_code: code })
    setBusy(false)
    if (error) return setError(dbError(error.message))
    track("league_joined", { via: "code" })
    onJoined(data as string)
  }

  return (
    <Box className="px-4 py-4">
      <h2 className="micro-label mb-4">{t("leagues.joinTitle")}</h2>
      <form onSubmit={submit} className="space-y-3">
        <Field
          label={t("leagues.codeLabel")}
          hint={t("leagues.codeHint")}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="h-12 w-full rounded-[2px] border-2 border-chalk/90 bg-brick/25 px-3 font-num text-xl tracking-[0.3em] text-chalk uppercase placeholder:text-chalk/50 focus:bg-brick/40 focus:outline-none"
          placeholder="ABC234"
        />
        {error && <ErrorBox message={error} />}
        <LineButton type="submit" disabled={busy || code.length !== 6} className="w-full">
          {busy ? t("leagues.joining") : t("leagues.join")}
        </LineButton>
      </form>
    </Box>
  )
}

function CreateForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc("create_league", { p_name: name })
    setBusy(false)
    if (error) return setError(dbError(error.message))
    track("league_created", {})
    onCreated(data as string)
  }

  return (
    <Box className="px-4 py-4">
      <h2 className="micro-label mb-4">{t("leagues.createTitle")}</h2>
      <form onSubmit={submit} className="space-y-3">
        <Field
          label={t("leagues.nameLabel")}
          placeholder={t("leagues.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          required
        />
        {error && <ErrorBox message={error} />}
        <ChalkButton type="submit" disabled={busy || name.trim().length < 2} className="w-full">
          {busy ? t("leagues.creating") : t("leagues.create")}
        </ChalkButton>
      </form>
    </Box>
  )
}
