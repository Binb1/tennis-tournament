import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ChevronRight } from "lucide-react"

import { AppShell, Box, ChalkButton, ErrorBox, LineButton, Loading, PageTitle, ResultTag, Tag } from "@/components/court/AppShell"
import { Flag } from "@/components/court/PlayerLabel"
import { useAuth } from "@/lib/auth"
import { dbError, roundName, t } from "@/lib/i18n"
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
import { fetchSeasons, rankOrdinal, rankSeason, seasonsOf, type EntryPoints, type Ranked } from "@/lib/season"
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
          {hasAny ? t("profile.editSocials") : t("profile.addSocials")}
        </button>
      </div>
    )

  return (
    <form onSubmit={save} className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <HandleField label="X (Twitter)" placeholder={t("profile.optional")} value={form.x} onChange={(e) => setForm({ ...form, x: e.target.value })} />
        <HandleField
          label="Instagram"
          placeholder={t("profile.optional")}
          value={form.instagram}
          onChange={(e) => setForm({ ...form, instagram: e.target.value })}
        />
      </div>
      <p className="text-xs text-chalk/75">{t("profile.socialsHint")}</p>
      {error && <ErrorBox message={error} />}
      <div className="grid grid-cols-2 gap-3">
        <LineButton type="button" onClick={() => setEditing(false)} disabled={saving}>
          {t("profile.cancel")}
        </LineButton>
        <ChalkButton type="submit" disabled={saving}>
          {saving ? t("profile.saving") : t("profile.save")}
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

  const [season, setSeason] = useState<{ mine: Ranked[]; players: Record<number, number> } | null>(null)
  const [entryPoints, setEntryPoints] = useState<Record<string, EntryPoints>>({})

  // My place in every season (the ranking needs everyone's totals) and the points of each of my tournaments.
  useEffect(() => {
    const uid = session!.user.id
    Promise.all([fetchSeasons(), supabase.from("season_entry_points").select("*").eq("user_id", uid)])
      .then(([all, ep]) => {
        if (ep.error) throw new Error(ep.error.message)
        const mine: Ranked[] = []
        const players: Record<number, number> = {}
        for (const s of seasonsOf(all)) {
          const ranked = rankSeason(all.filter((r) => r.season === s))
          players[s] = ranked.length
          const me = ranked.find((r) => r.user_id === uid)
          if (me) mine.push(me)
        }
        setSeason({ mine, players })
        setEntryPoints(Object.fromEntries((ep.data as EntryPoints[]).map((x) => [x.entry_id, x])))
      })
      .catch((err: Error) => setError(err.message))
  }, [session])

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
        const [w, p] = await Promise.all([fetchWinners(finished), fetchLastPicks(s.data as EntryStatus[])])
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
      setDeleteError(dbError(error.message))
      return
    }
    await signOut()
  }

  return (
    <AppShell>
      <PageTitle eyebrow={t("profile.eyebrow")}>{displayName(profile)}</PageTitle>
      <p className="-mt-2 text-sm text-chalk/85">{session?.user.email}</p>
      <div className="mb-8">
        <SocialsEditor />
      </div>

      {season && season.mine.length > 0 && <MySeasons mine={season.mine} players={season.players} />}

      <section className="mb-10">
        <h2 className="micro-label mb-3">{t("profile.myTournaments")}</h2>
        {error && <ErrorBox message={error} />}
        {!rows && !error && <Loading />}
        {rows && rows.length === 0 && (
          <p className="border-2 border-dashed border-chalk/60 px-4 py-6 text-center text-chalk/90">
            {t("profile.empty")}{" "}
            <Link to="/tournois" className="inline-block py-3 underline underline-offset-4">
              {t("profile.seeTournaments")}
            </Link>
          </p>
        )}
        {rows && rows.length > 0 && (
          <ul className="border-2 border-chalk/90">
            {rows.map((r) => {
              const tn = r.tournaments
              const s = statuses[r.id]
              const last = lastPicks[r.id]
              if (!tn) return null
              return (
                <li key={r.id} className="border-t-2 border-chalk/50 first:border-t-0">
                  <Link to={`/tournois/${tn.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-chalk/10">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        <Flag code={tn.country} className="mr-1.5" />
                        {tn.name}
                      </p>
                      <p className="text-xs text-chalk/80">
                        {formatDate(tn.starts_at)}
                        {s && s.rounds_survived > 0 && ` · ${t("profile.roundsPassed", { count: s.rounds_survived })}`}
                        {entryPoints[r.id] && (
                          <strong className="font-bold text-chalk"> · {entryPoints[r.id].points} pts</strong>
                        )}
                      </p>
                      {last && (
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
                          <span className="text-chalk/85">{t("profile.yourPick", { round: roundName(last.roundName) })}</span>
                          <span className="inline-flex items-center gap-1 font-bold">
                            <Flag code={last.country} />
                            {last.player}
                          </span>
                          <ResultTag result={last.result} />
                        </p>
                      )}
                    </div>
                    {s ? <MyState status={tn.status} me={s} winner={winners.has(r.id)} /> : <Tag tone="neutral">{t("profile.joined")}</Tag>}
                    <ChevronRight className="size-4 shrink-0 text-chalk/70" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <LineButton onClick={signOut} className="w-full">
        {t("profile.signOut")}
      </LineButton>

      <section className="mt-12 border-t-2 border-chalk/60 pt-6">
        {!confirming ? (
          <button onClick={() => setConfirming(true)} className="min-h-11 text-sm font-medium underline underline-offset-4">
            {t("profile.deleteAccount")}
          </button>
        ) : (
          <Box className="border-chalk bg-brick/60 px-4 py-4">
            <p className="font-display text-xl">{t("profile.deleteTitle")}</p>
            <p className="mt-2 text-sm text-chalk/90">
              {t("profile.deleteText", { name: t("common.deletedUser") })}
            </p>
            {deleteError && (
              <div className="mt-3">
                <ErrorBox message={deleteError} />
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <LineButton onClick={() => setConfirming(false)} disabled={deleting}>
                {t("profile.cancel")}
              </LineButton>
              <button
                onClick={deleteAccount}
                disabled={deleting}
                className="min-h-11 rounded-[2px] bg-ink px-4 text-[13px] font-bold tracking-[0.14em] text-chalk uppercase [font-stretch:85%] hover:bg-ink/85 disabled:opacity-60"
              >
                {deleting ? t("profile.deleting") : t("profile.delete")}
              </button>
            </div>
          </Box>
        )}
      </section>
    </AppShell>
  )
}

/** My season: the current one in big numbers, past ones as one line each. */
function MySeasons({ mine, players }: { mine: Ranked[]; players: Record<number, number> }) {
  const [cur, ...past] = mine
  const tiles = [
    {
      label: t("profile.ranking"),
      value: rankOrdinal(cur.rank),
      sub: `${t("profile.outOf", { count: players[cur.season] })}${cur.tied ? ` · ${t("profile.tied")}` : ""}`,
    },
    { label: t("profile.points"), value: cur.points, sub: t("profile.bonus", { n: cur.winner_bonus + cur.champion_bonus }) },
    { label: t("profile.played"), value: cur.tournaments_played, sub: t("profile.allCount") },
    { label: t("profile.roundsWon"), value: cur.rounds_won, sub: t("profile.plusPts", { n: cur.round_points }) },
    {
      label: t("profile.won"),
      value: cur.tournaments_won,
      sub: cur.tournaments_won > 0 ? t("profile.plusPts", { n: cur.winner_bonus }) : t("profile.lastStanding"),
    },
    {
      label: t("profile.champions"),
      value: cur.champions_predicted,
      sub: cur.champions_predicted > 0 ? t("profile.plusPts", { n: cur.champion_bonus }) : t("profile.championHint"),
    },
  ]
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="micro-label">{t("profile.mySeason", { year: cur.season })}</h2>
        <Link to="/saison" className="text-sm underline underline-offset-4">
          {t("profile.ranking")}
        </Link>
      </div>
      <div className="grid grid-cols-2 border-2 border-chalk/90">
        {tiles.map((tile, i) => (
          <div key={tile.label} className={`px-4 py-3 ${i % 2 ? "border-l-2 border-chalk/50" : ""} ${i > 1 ? "border-t-2 border-chalk/50" : ""}`}>
            <span className="micro-label">{tile.label}</span>
            <p className="mt-1 font-display text-3xl leading-none tabular-nums">{tile.value}</p>
            <p className="mt-1 text-xs text-chalk/80">{tile.sub}</p>
          </div>
        ))}
      </div>
      {past.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-chalk/85">
          {past.map((s) => (
            <li key={s.season} className="tabular-nums">
              {t("profile.pastSeason", { year: s.season, rank: rankOrdinal(s.rank), count: players[s.season], points: s.points })}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
