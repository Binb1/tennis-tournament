import { Flag } from "@/components/court/PlayerLabel"
import type { Match, Player, Round } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const SLOT_H = 76 // px per first-round slot
const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(1, n)))

/**
 * The draw as a bracket: rounds as columns, matches ordered by position.
 * Slot p of round k+1 is fed by slots 2p-1 and 2p of round k; a missing match is an empty slot
 * (its players are the winners of the two feeding matches, when known).
 */
export function Bracket({
  rounds,
  matches,
  playerById,
  drawSize,
  pickByRound,
}: {
  rounds: Round[]
  matches: Match[]
  playerById: Map<string, Player>
  drawSize: number
  /** Current user's pick per round id. */
  pickByRound: Map<string, string>
}) {
  const byRound = new Map<string, Map<number, Match>>()
  for (const m of matches) {
    if (!m.position) continue
    if (!byRound.has(m.round_id)) byRound.set(m.round_id, new Map())
    byRound.get(m.round_id)!.set(m.position, m)
  }
  // First-round slots: from the draw size and the positions actually used.
  let first = nextPow2(drawSize) / 2
  rounds.forEach((r, k) => {
    for (const pos of byRound.get(r.id)?.keys() ?? []) first = Math.max(first, nextPow2(pos) * 2 ** k)
  })
  const cols = rounds.slice(0, Math.log2(first) + 1).map((r, k) => ({ r, slots: first / 2 ** k }))

  // Walk the rounds in order so a derived slot can read the winners of the round before.
  const slotsByCol: { p1: string | null; p2: string | null; m?: Match }[][] = []
  cols.forEach(({ r, slots }, k) => {
    const out = []
    for (let p = 1; p <= slots; p++) {
      const m = byRound.get(r.id)?.get(p)
      if (m) out.push({ p1: m.player1_id, p2: m.player2_id, m })
      else {
        const prev = slotsByCol[k - 1]
        out.push({ p1: prev?.[2 * p - 2]?.m?.winner_id ?? null, p2: prev?.[2 * p - 1]?.m?.winner_id ?? null })
      }
    }
    slotsByCol.push(out)
  })

  return (
    <div className="overflow-x-auto overscroll-x-contain border-2 border-chalk/90">
      <div className="flex w-max py-3">
        {cols.map(({ r }, k) => (
          <div key={r.id} className="w-[212px] shrink-0">
            <h3 className="mb-2 px-4 text-center text-[11px] font-bold tracking-[0.12em] uppercase [font-stretch:85%]">{r.name}</h3>
            <ol className="flex flex-col" style={{ height: first * SLOT_H }}>
              {slotsByCol[k].map((s, i) => (
                <li key={i} className="relative flex flex-1 items-center px-4">
                  {k > 0 && <span aria-hidden="true" className="absolute top-1/2 left-0 w-4 border-t-2 border-chalk/60" />}
                  {k < cols.length - 1 && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute right-0 h-1/2 w-4 border-r-2 border-chalk/60",
                        i % 2 === 0 ? "top-1/2 border-t-2" : "top-0 border-b-2",
                      )}
                    />
                  )}
                  <MatchBox s={s} playerById={playerById} pick={pickByRound.get(r.id)} />
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  )
}

function MatchBox({
  s,
  playerById,
  pick,
}: {
  s: { p1: string | null; p2: string | null; m?: Match }
  playerById: Map<string, Player>
  pick?: string
}) {
  const m = s.m
  const done = m?.status === "done" && !!m.winner_id
  const row = (pid: string | null) => {
    const p = pid ? playerById.get(pid) : undefined
    const won = done && pid === m!.winner_id
    const lost = done && !!pid && !won
    return (
      <div
        className={cn(
          "flex h-6 items-center gap-1.5 px-1.5 text-[12px]",
          won && "font-bold",
          lost && "text-chalk/55",
          pid && pid === pick && "bg-chalk/20 shadow-[inset_3px_0_0_var(--color-ball)]",
        )}
      >
        {p ? (
          <>
            <Flag code={p.country} />
            {p.seed && <span className="shrink-0 text-[10px] tabular-nums opacity-75">[{p.seed}]</span>}
            <span className="min-w-0 truncate">{p.name}</span>
          </>
        ) : (
          <span className="text-chalk/50">{m ? "à déterminer" : "–"}</span>
        )}
      </div>
    )
  }
  return (
    <div className={cn("w-full border-2 bg-ink/15", m ? "border-chalk/80" : "border-dashed border-chalk/40")}>
      {row(s.p1)}
      <div className="border-t border-chalk/30">{row(s.p2)}</div>
      {m?.score && (
        <div className="truncate border-t border-chalk/30 px-1.5 text-[10px] leading-4 text-chalk/80 tabular-nums">
          {m.status === "live" ? "En cours · " : ""}
          {m.score}
        </div>
      )}
    </div>
  )
}
