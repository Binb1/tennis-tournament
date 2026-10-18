import { useState, type CSSProperties, type ReactNode } from "react"
import { Link } from "react-router-dom"

import { AppShell, Box, PageTitle } from "@/components/court/AppShell"
import { PixelSvg, Sprite } from "@/components/pixel/Sprite"
import { BALL, PLAYER_CHEER, QUESTION_BALL, TROPHY } from "@/components/pixel/sprites"
import { useAuth } from "@/lib/auth"
import { CATEGORIES, bonusPoints, roundWeight, type Category } from "@/lib/scoring"
import { cn } from "@/lib/utils"

/** Round names counted back from the final (index = rounds left after it). */
const FROM_END = ["Finale", "Demies", "Quarts", "8es", "16es", "32es", "64es"]
/** Typical draw per category: 28/32 for 250 and 500, 96/128 for Masters and Slams. */
const ROUNDS: Record<Category, number> = { atp250: 5, atp500: 5, masters1000: 7, grand_slam: 7 }
const TOP = roundWeight(0) * CATEGORIES[CATEGORIES.length - 1].mult
/** Cup metal by category: bronze, silver, gold, ball. */
const METAL: Record<Category, string> = { atp250: "#c0763b", atp500: "#c9ccd1", masters1000: "#e9b949", grand_slam: "var(--color-ball)" }

/** Scoring in pictures: few words, the numbers from lib/scoring.ts. Public like the rules. */
export default function Points() {
  const { session } = useAuth()
  const [cat, setCat] = useState<Category>("grand_slam")
  const c = CATEGORIES.find((x) => x.id === cat)!
  const rounds = Array.from({ length: ROUNDS[cat] }, (_, i) => ROUNDS[cat] - 1 - i)

  const r1of250 = roundWeight(ROUNDS.atp250 - 1) * CATEGORIES[0].mult
  const slamSemi = roundWeight(1) * CATEGORIES[3].mult

  return (
    <AppShell bare={!session}>
      <PageTitle eyebrow="Classement de la saison">Les points</PageTitle>

      <Box className="mb-10 px-4 py-4">
        <p className="font-display text-2xl leading-tight">Plus tu vas loin, plus ça rapporte.</p>
        <p className="mt-2 text-sm text-chalk/90">Et plus le tournoi est grand, plus chaque tour pèse.</p>
      </Box>

      <div className="space-y-12">
        <Step n={1} title="Chaque tour gagné">
          <div role="radiogroup" aria-label="Catégorie de tournoi" className="mb-4 grid grid-cols-4 gap-1.5">
            {CATEGORIES.map((x) => (
              <button
                key={x.id}
                role="radio"
                aria-checked={x.id === cat}
                onClick={() => setCat(x.id)}
                className={cn(
                  "min-h-11 rounded-[2px] border-2 px-1 text-xs font-bold tracking-[0.06em] uppercase [font-stretch:85%]",
                  x.id === cat ? "border-chalk bg-chalk text-ink" : "border-chalk/60 hover:bg-chalk/10",
                )}
              >
                {x.label}
              </button>
            ))}
          </div>
          <Box className="px-3 pt-4 pb-3">
            <div className="flex h-44 items-end gap-1.5" aria-label={`Points par tour, ${c.label}`}>
              {rounds.map((left) => {
                const pts = roundWeight(left) * c.mult
                return (
                  <div key={left} className="flex min-w-0 flex-1 flex-col items-center justify-end self-stretch">
                    {left === 0 && (
                      <PixelSvg w={4} h={4} className="mb-1 w-3">
                        <Sprite rows={BALL} className="px-hop" />
                      </PixelSvg>
                    )}
                    <span className="mb-1 font-num text-base leading-none tabular-nums">{pts}</span>
                    <span
                      className="block w-full border-2 border-chalk/90 bg-brick/50 transition-[height] duration-500 motion-reduce:transition-none"
                      style={{ height: `${(pts / TOP) * 100}%`, minHeight: 6 }}
                    />
                  </div>
                )
              })}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              {rounds.map((left) => (
                <span key={left} className="min-w-0 flex-1 truncate text-center text-[10px] font-bold tracking-[0.04em] uppercase [font-stretch:85%]">
                  {FROM_END[left]}
                </span>
              ))}
            </div>
          </Box>
          <p className="mt-3 text-sm text-chalk/90">Chaque tour vaut plus que le précédent. La finale vaut le plus.</p>
        </Step>

        <Step n={2} title="Le tournoi multiplie">
          <div className="grid grid-cols-4 items-end gap-2">
            {CATEGORIES.map((x, i) => (
              <div key={x.id} className="flex flex-col items-center text-center">
                <PixelSvg w={9} h={10} style={{ width: 20 + i * 10 } as CSSProperties}>
                  <Sprite rows={TROPHY} style={{ "--px-metal": METAL[x.id] } as CSSProperties} />
                </PixelSvg>
                <span className="mt-2 font-display text-2xl leading-none tabular-nums">×{x.mult}</span>
                <span className="mt-1 text-[11px] font-bold tracking-[0.04em] uppercase [font-stretch:85%]">{x.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-chalk/90">Un Grand Chelem vaut 4 fois un ATP 250.</p>
        </Step>

        <Step n={3} title="Deux bonus">
          <div className="grid grid-cols-2 gap-3">
            <Bonus
              art={
                <PixelSvg w={15} h={14} className="w-12">
                  <Sprite rows={PLAYER_CHEER} className="px-hop" />
                </PixelSvg>
              }
              title="Dernier debout"
              text="Tu gagnes le tournoi."
            />
            <Bonus
              art={
                <PixelSvg w={9} h={9} className="w-10">
                  <Sprite rows={QUESTION_BALL} className="px-hop" style={{ "--delay": "0.4s" } as CSSProperties} />
                </PixelSvg>
              }
              title="Bon pronostic"
              text="Tu as deviné le vainqueur avant le 1er tour."
            />
          </div>
          <p className="mt-3 text-sm text-chalk/90">
            +{bonusPoints("atp250")} chacun en 250, jusqu'à +{bonusPoints("grand_slam")} en Grand Chelem. Le pronostic
            compte même si tu es éliminé.
          </p>
        </Step>

        <Step n={4} title="Tout compte">
          <Box className="space-y-4 px-4 py-4">
            <Compare label={`10 × 1er tour d'un 250`} pts={10 * r1of250} balls={10} />
            <Compare label="1 demie de Grand Chelem" pts={slamSemi} balls={1} big />
          </Box>
          <p className="mt-3 text-sm text-chalk/90">
            Chaque tournoi joué ajoute des points, même trois la même semaine. Mais viser juste rapporte plus que jouer
            beaucoup : tu peux rater des tournois et finir n°1.
          </p>
        </Step>
      </div>

      <p className="mt-12 flex flex-wrap gap-x-6 text-sm">
        <Link to="/regles" className="inline-flex min-h-11 items-center underline underline-offset-4">
          Règles du jeu
        </Link>
        <Link to={session ? "/saison" : "/connexion"} className="inline-flex min-h-11 items-center underline underline-offset-4">
          {session ? "Classement de la saison" : "Se connecter pour jouer"}
        </Link>
      </p>
    </AppShell>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-baseline gap-2">
        <span className="font-num text-xl tabular-nums">{n}</span>
        <span className="micro-label">{title}</span>
      </h2>
      {children}
    </section>
  )
}

function Bonus({ art, title, text }: { art: ReactNode; title: string; text: string }) {
  return (
    <Box className="flex flex-col items-center px-3 py-4 text-center">
      <div className="flex h-14 items-end">{art}</div>
      <p className="mt-3 font-display text-xl leading-tight">{title}</p>
      <p className="mt-1 text-xs text-chalk/85">{text}</p>
    </Box>
  )
}

/** One side of "volume vs accuracy": a row of balls and the points. */
function Compare({ label, pts, balls, big = false }: { label: string; pts: number; balls: number; big?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: balls }, (_, i) => (
            <PixelSvg key={i} w={4} h={4} className={big ? "w-6" : "w-3"}>
              <Sprite rows={BALL} />
            </PixelSvg>
          ))}
        </div>
        <span className="text-sm">{label}</span>
      </div>
      <span className={cn("shrink-0 font-num tabular-nums", big ? "text-4xl" : "text-2xl")}>
        {pts}
        <span className="ml-1 font-sans text-xs">pts</span>
      </span>
    </div>
  )
}
