import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ChevronRight } from "lucide-react"

import { AppShell, Box, ErrorBox, Loading, PageTitle, Tag } from "@/components/court/AppShell"
import { MiniCourt } from "@/components/court/SurfacePicker"
import { useAuth } from "@/lib/auth"
import { isThemeId, themeLabel } from "@/lib/theme"
import { STATUS_LABEL, fetchWinners, formatDate, supabase, type EntryStatus, type Round, type Tournament } from "@/lib/supabase"
import { formatLeft, useNow } from "@/lib/time"

type Row = Tournament & { entries: { count: number }[] }

const GROUPS = [
  { status: "registration", title: "Ouverts" },
  { status: "live", title: "En cours" },
  { status: "finished", title: "Terminés" },
] as const

export default function Tournaments() {
  const { session } = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [mine, setMine] = useState<Record<string, EntryStatus>>({})
  const [winners, setWinners] = useState<Set<string>>(new Set())
  // Open round per tournament (first round not locked yet) and the rounds I already picked in.
  const [openRound, setOpenRound] = useState<Record<string, Round>>({})
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const now = useNow(30_000)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    setError(null)
    Promise.all([
      supabase.from("tournaments").select("*, entries(count)").order("starts_at", { ascending: false }),
      supabase.from("entry_status").select("*").eq("user_id", session!.user.id),
    ]).then(async ([t, e]) => {
      if (!active) return
      if (t.error || e.error) return setError((t.error ?? e.error)!.message)
      const rows = t.data as Row[]
      const mine = e.data as EntryStatus[]
      const finished = new Set(rows.filter((x) => x.status === "finished").map((x) => x.id))
      const playing = rows.filter((x) => x.status === "registration" || x.status === "live").map((x) => x.id)
      try {
        const [w, r, p] = await Promise.all([
          fetchWinners(mine.filter((s) => finished.has(s.tournament_id)).map((s) => s.tournament_id)),
          supabase.from("rounds").select("*").in("tournament_id", playing).gt("locks_at", new Date().toISOString()).order("idx"),
          supabase.from("picks").select("round_id").in("entry_id", mine.map((s) => s.entry_id)),
        ])
        if (r.error || p.error) throw new Error((r.error ?? p.error)!.message)
        if (!active) return
        setWinners(w)
        const open: Record<string, Round> = {}
        for (const round of r.data as Round[]) open[round.tournament_id] ??= round
        setOpenRound(open)
        setPicked(new Set((p.data as { round_id: string }[]).map((x) => x.round_id)))
      } catch (err) {
        if (active) setError((err as Error).message)
        return
      }
      setRows(rows)
      setMine(Object.fromEntries(mine.map((s) => [s.tournament_id, s])))
    })
    return () => {
      active = false
    }
  }, [session, reload])

  return (
    <AppShell>
      <PageTitle eyebrow="Saison 2026">Tournois</PageTitle>
      {error && <ErrorBox message={error} onRetry={() => setReload((n) => n + 1)} />}
      {!rows && !error && <Loading />}
      {rows && rows.length === 0 && <p className="py-8 text-center text-chalk/85">Aucun tournoi pour l'instant.</p>}
      {rows &&
        GROUPS.map((g) => {
          const list = rows.filter((t) => t.status === g.status)
          if (!list.length) return null
          return (
            <section key={g.status} className="mb-8">
              <h2 className="micro-label mb-3">{g.title}</h2>
              <div className="space-y-3">
                {list.map((t) => (
                  <TournamentCard
                    key={t.id}
                    t={t}
                    me={mine[t.id]}
                    winners={winners}
                    round={openRound[t.id]}
                    picked={picked}
                    now={now}
                  />
                ))}
              </div>
            </section>
          )
        })}
    </AppShell>
  )
}

function TournamentCard({
  t,
  me,
  winners,
  round,
  picked,
  now,
}: {
  t: Row
  me?: EntryStatus
  winners: Set<string>
  round?: Round
  picked: Set<string>
  now: number
}) {
  const count = t.entries[0]?.count ?? 0
  // Picks are open during registration (round 1 only) and live.
  const open = round && (t.status === "live" || round.idx === 1) ? round : undefined
  const ms = open ? new Date(open.locks_at).getTime() - now : 0
  return (
    <Link to={`/tournois/${t.id}`} className="block">
      <Box className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-chalk/10">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="neutral">{STATUS_LABEL[t.status]}</Tag>
            {me && <MyState status={t.status} me={me} winner={winners.has(me.entry_id)} />}
            {me?.alive && open && ms > 0 && !picked.has(open.id) && <Tag tone="alert">Pas de choix</Tag>}
          </div>
          <h3 className="mt-2 font-display text-2xl leading-tight [overflow-wrap:anywhere]">
            {isThemeId(t.theme) && (
              <span title={`Style ${themeLabel(t.theme)}`} className="mr-2 inline-block align-[0.1em]">
                <MiniCourt id={t.theme} small className="outline outline-1 outline-chalk/50" />
              </span>
            )}
            {t.name}
          </h3>
          <p className="mt-1 text-sm text-chalk/85">
            {t.tour} · {formatDate(t.starts_at)} · {count} {count > 1 ? "inscrits" : "inscrit"}
          </p>
          {open && ms > 0 && (
            <p className="mt-1 text-sm font-bold">
              {open.name} · verrouillage dans <span className="tabular-nums">{formatLeft(ms, false)}</span>
            </p>
          )}
        </div>
        <ChevronRight className="size-5 shrink-0 text-chalk/80" />
      </Box>
    </Link>
  )
}

/** `winner`: see fetchWinners (co-winners when nobody is alive at the end). */
export function MyState({ status, me, winner }: { status: Tournament["status"]; me: EntryStatus; winner: boolean }) {
  if (status === "registration") return <Tag tone="alive">Inscrit</Tag>
  if (status === "finished" && winner) return <Tag tone="win">Vainqueur</Tag>
  if (!me.alive) return <Tag tone="out">Éliminé</Tag>
  return <Tag tone="alive">En vie</Tag>
}
