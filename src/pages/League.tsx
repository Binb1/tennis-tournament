import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Copy, Pencil, Share2, X } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"

import { AppShell, Box, ChalkButton, ErrorBox, Field, LineButton, Loading, PageTitle } from "@/components/court/AppShell"
import { useAuth } from "@/lib/auth"
import { dbError, locale, t } from "@/lib/i18n"
import { fetchMyLeagues, inviteUrl, memberIds, type League } from "@/lib/leagues"
import { fetchSeasons, rankSeason, seasonsOf, type SeasonRow } from "@/lib/season"
import { displayName, supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

/** One league: invite (code, QR code, link), members ranked on the current season, owner tools, leave. */
export default function LeaguePage() {
  const { id = "" } = useParams()
  const { session } = useAuth()
  const uid = session?.user.id
  const navigate = useNavigate()
  const [league, setLeague] = useState<League | null | undefined>(undefined)
  const [seasonRows, setSeasonRows] = useState<SeasonRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const reload = useCallback(() => {
    setError(null)
    return Promise.all([fetchMyLeagues(), fetchSeasons()])
      .then(([ls, rows]) => {
        setLeague(ls.find((l) => l.id === id) ?? null)
        setSeasonRows(rows)
      })
      .catch((e: Error) => setError(e.message))
  }, [id])

  useEffect(() => {
    reload()
  }, [reload])

  async function rpc(fn: string, args: Record<string, string>) {
    setActionError(null)
    const { error } = await supabase.rpc(fn, args)
    if (error) {
      setActionError(dbError(error.message))
      return false
    }
    return true
  }

  if (error) return <AppShell><ErrorBox message={error} onRetry={reload} /></AppShell>
  if (league === undefined) return <AppShell><Loading /></AppShell>
  if (league === null)
    return (
      <AppShell>
        <BackLink />
        <p className="border-2 border-dashed border-chalk/60 px-4 py-6 text-center text-chalk/90">{t("leagues.notFound")}</p>
      </AppShell>
    )

  const owner = league.owner_id === uid
  const season = seasonsOf(seasonRows)[0] ?? new Date().getFullYear()
  const ids = memberIds(league)
  const ranked = rankSeason(seasonRows.filter((r) => r.season === season && ids.has(r.user_id)))
  const rankOf = new Map(ranked.map((r) => [r.user_id, r]))
  // Members without points this season yet go last, by name.
  const members = [...league.league_members].sort(
    (a, b) =>
      (rankOf.get(a.user_id)?.rank ?? Infinity) - (rankOf.get(b.user_id)?.rank ?? Infinity) ||
      displayName(a.profiles).localeCompare(displayName(b.profiles), locale()),
  )

  return (
    <AppShell>
      <BackLink />
      {owner ? (
        <RenameTitle league={league} onSave={async (name) => (await rpc("rename_league", { p_league_id: league.id, p_name: name })) && reload()} />
      ) : (
        <PageTitle eyebrow={t("leagues.members", { count: league.league_members.length })}>{league.name}</PageTitle>
      )}

      {actionError && <div className="mb-4"><ErrorBox message={actionError} /></div>}

      <Invite
        league={league}
        owner={owner}
        onNewCode={async () => (await rpc("reset_league_code", { p_league_id: league.id })) && reload()}
      />

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="micro-label">{t("leagues.standingsTitle", { year: season })}</h2>
          <Link to={`/saison?ligue=${league.id}`} className="inline-flex min-h-11 items-center text-xs font-medium underline underline-offset-4">
            {t("leagues.seeSeason")}
          </Link>
        </div>
        <ol className="border-2 border-chalk/90">
          {members.map((m) => {
            const r = rankOf.get(m.user_id)
            const me = m.user_id === uid
            return (
              <li
                key={m.user_id}
                className={cn("flex items-center gap-3 border-t-2 border-chalk/50 px-3 py-2 first:border-t-0", me && "bg-brick/35 shadow-[inset_4px_0_0_var(--color-chalk)]")}
              >
                <span className="w-7 shrink-0 text-sm font-bold tabular-nums">{r?.rank ?? "–"}</span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {displayName(m.profiles)}
                  {me && <span className="ml-1.5 text-xs opacity-75">{t("leagues.me")}</span>}
                  {m.user_id === league.owner_id && <span className="ml-1.5 text-xs opacity-75">· {t("leagues.owner")}</span>}
                </span>
                <span className="shrink-0">
                  <span className="font-display text-xl tabular-nums">{r?.points ?? 0}</span>
                  <span className="ml-1 text-xs text-chalk/80">{t("leagues.pts")}</span>
                </span>
                {owner && !me && (
                  <RemoveButton
                    name={displayName(m.profiles)}
                    onRemove={async () => (await rpc("remove_league_member", { p_league_id: league.id, p_user_id: m.user_id })) && reload()}
                  />
                )}
              </li>
            )
          })}
        </ol>
      </section>

      <section className="mt-10">
        <Leave
          owner={owner}
          onLeave={async () => {
            if (await rpc("leave_league", { p_league_id: league.id })) navigate("/ligues", { replace: true })
          }}
        />
      </section>
    </AppShell>
  )
}

function BackLink() {
  return (
    <Link to="/ligues" className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-chalk/90 hover:text-chalk">
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t("leagues.back")}
    </Link>
  )
}

function RenameTitle({ league, onSave }: { league: League; onSave: (name: string) => Promise<unknown> }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(league.name)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    await onSave(name)
    setBusy(false)
    setEditing(false)
  }

  if (!editing)
    return (
      <PageTitle
        eyebrow={t("leagues.members", { count: league.league_members.length })}
        aside={
          <button onClick={() => setEditing(true)} aria-label={t("leagues.rename")} className="inline-flex size-11 shrink-0 items-center justify-center hover:bg-chalk/10">
            <Pencil className="size-5" aria-hidden="true" />
          </button>
        }
      >
        {league.name}
      </PageTitle>
    )
  return (
    <form onSubmit={submit} className="mb-6 space-y-3">
      <Field label={t("leagues.nameLabel")} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required autoFocus />
      <div className="flex gap-2">
        <ChalkButton type="submit" disabled={busy || name.trim().length < 2} className="flex-1">
          {t("leagues.save")}
        </ChalkButton>
        <LineButton type="button" onClick={() => setEditing(false)} className="flex-1">
          {t("leagues.cancel")}
        </LineButton>
      </div>
    </form>
  )
}

/** The code in big, its QR code (a link to /rejoindre/CODE), share or copy the link; the owner can draw a new code. */
function Invite({ league, owner, onNewCode }: { league: League; owner: boolean; onNewCode: () => Promise<unknown> }) {
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const url = inviteUrl(league.code)
  const canShare = typeof navigator !== "undefined" && !!navigator.share

  async function share() {
    try {
      await navigator.share({ title: league.name, text: t("leagues.shareText", { name: league.name }), url })
    } catch {
      // cancelled
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard blocked: the code is on screen anyway
    }
  }

  return (
    <Box className="px-4 py-4">
      <h2 className="micro-label">{t("leagues.inviteTitle")}</h2>
      <p className="mt-1 text-sm text-chalk/85">{t("leagues.inviteBody")}</p>
      <div className="mt-4 flex flex-col items-center gap-4 min-[420px]:flex-row min-[420px]:items-center">
        {/* White quiet zone around the code: phone cameras need the contrast. */}
        <div className="shrink-0 bg-white p-3">
          <QRCodeSVG value={url} size={148} level="M" title={t("leagues.qrLabel", { name: league.name })} />
        </div>
        <div className="flex w-full min-w-0 flex-1 flex-col gap-3">
          <p className="text-center font-num text-4xl tracking-[0.25em] tabular-nums select-all min-[420px]:text-left">{league.code}</p>
          {canShare ? (
            <ChalkButton onClick={share} className="w-full">
              <Share2 className="size-4" aria-hidden="true" />
              {t("leagues.share")}
            </ChalkButton>
          ) : (
            <ChalkButton onClick={copy} className="w-full">
              <Copy className="size-4" aria-hidden="true" />
              {copied ? t("leagues.copied") : t("leagues.copy")}
            </ChalkButton>
          )}
          {owner && (
            <LineButton
              onClick={async () => {
                if (!confirming) return setConfirming(true)
                await onNewCode()
                setConfirming(false)
              }}
              className="w-full text-[11px]"
            >
              {confirming ? t("leagues.newCodeConfirm") : t("leagues.newCode")}
            </LineButton>
          )}
        </div>
      </div>
    </Box>
  )
}

/** Two taps: the × turns into "Remove?". */
function RemoveButton({ name, onRemove }: { name: string; onRemove: () => Promise<unknown> }) {
  const [confirming, setConfirming] = useState(false)
  if (confirming)
    return (
      <button onClick={onRemove} onBlur={() => setConfirming(false)} autoFocus className="min-h-11 shrink-0 px-2 text-xs font-bold underline underline-offset-4">
        {t("leagues.removeConfirm")}
      </button>
    )
  return (
    <button onClick={() => setConfirming(true)} aria-label={t("leagues.remove", { name })} className="inline-flex size-11 shrink-0 items-center justify-center text-chalk/80 hover:text-chalk">
      <X className="size-4" aria-hidden="true" />
    </button>
  )
}

function Leave({ owner, onLeave }: { owner: boolean; onLeave: () => Promise<unknown> }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="space-y-2">
      {confirming && owner && <p className="text-sm text-chalk/85">{t("leagues.leaveOwner")}</p>}
      <LineButton onClick={() => (confirming ? onLeave() : setConfirming(true))} className="w-full">
        {confirming ? t("leagues.leaveConfirm") : t("leagues.leave")}
      </LineButton>
    </div>
  )
}
