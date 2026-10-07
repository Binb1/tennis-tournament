import { useState, type CSSProperties, type ReactNode } from "react"

import { AppShell, Box, Loading, PageTitle, ResultTag, Tag } from "@/components/court/AppShell"
import { BallMark } from "@/components/court/BallMark"
import {
  BallBoyRun,
  BallConfetti,
  ClimbArrow,
  PixelLoader,
  PixelNetFault,
  PixelPodium,
  PixelRally,
  PixelWin,
  ShotClock,
} from "@/components/pixel/Animations"
import { useNow } from "@/lib/time"
import { cn } from "@/lib/utils"

/** Review page for the pixel animations (not linked from the app). Switch styles with the surface menu. */
export default function AnimationExamples() {
  return (
    <AppShell>
      <PageTitle eyebrow="Aperçu">Animations pixel</PageTitle>
      <p className="-mt-2 mb-8 text-sm text-chalk/85">
        Chaque animation prend les couleurs du style choisi : change de surface avec le menu en haut à droite pour
        les voir sur chaque tournoi. Avec « réduire les animations » activé sur l'appareil, tout reste immobile.
      </p>
      <div className="space-y-10">
        <Rally />
        <Won />
        <Lost />
        <Loader />
        <Lock />
        <Ranking />
        <Logo />
      </div>
    </AppShell>
  )
}

function Example({
  n,
  title,
  where,
  replay,
  children,
}: {
  n: number
  title: string
  where: string
  replay?: () => void
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl leading-tight">
          <span className="mr-2 tabular-nums text-chalk/70">{n}.</span>
          {title}
        </h2>
        {replay && (
          <button onClick={replay} className="min-h-11 shrink-0 text-sm font-bold underline underline-offset-4">
            Rejouer
          </button>
        )}
      </div>
      <p className="mb-3 text-sm text-chalk/85">{where}</p>
      {children}
    </section>
  )
}

/** Remount key for one-shot animations. */
function useReplay(): [number, () => void] {
  const [k, setK] = useState(0)
  return [k, () => setK((n) => n + 1)]
}

function Rally() {
  return (
    <Example n={1} title="Échange sur la page d'accueil" where="Landing : sous le titre, un échange en continu par-dessus le filet.">
      <Box className="px-4 pt-6 pb-4">
        <PixelRally />
      </Box>
    </Example>
  )
}

function Won() {
  const [k, replay] = useReplay()
  return (
    <Example n={2} title="Ton choix gagne" where="Carte du tournoi et « Mon choix » : une fois, à la première visite après le résultat." replay={replay}>
      <div key={k} className="space-y-4">
        <Box className="flex justify-center px-4 py-4">
          <PixelWin />
        </Box>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-l-4 border-chalk bg-brick/40 px-3 py-2 text-sm">
          <span className="text-chalk/90">Ton choix · 2e tour :</span>
          <strong className="font-bold">Valentin Vacherot</strong>
          <span className="relative inline-flex">
            <ResultTag result="won" />
            <BallConfetti className="absolute -top-8 left-1/2 w-24 -translate-x-1/2" />
          </span>
        </p>
      </div>
    </Example>
  )
}

function Lost() {
  const [k, replay] = useReplay()
  return (
    <Example n={3} title="Ton choix perd" where="Même endroits : la balle touche la bande, le filet tremble, elle retombe de ton côté." replay={replay}>
      <div key={k} className="space-y-4">
        <Box className="flex justify-center px-4 py-4">
          <PixelNetFault />
        </Box>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-l-4 border-chalk bg-brick/40 px-3 py-2 text-sm">
          <span className="text-chalk/90">Ton choix · 2e tour :</span>
          <strong className="font-bold">Alexander Zverev</strong>
          <ResultTag result="lost" />
        </p>
      </div>
    </Example>
  )
}

function Loader() {
  return (
    <Example n={6} title="Chargement" where="Partout où la page charge (remplace « Chargement… »).">
      <div className="grid grid-cols-2 gap-3">
        <Box>
          <PixelLoader />
        </Box>
        <Box className="opacity-70">
          <Loading label="Avant" />
        </Box>
      </div>
    </Example>
  )
}

function Lock() {
  const [start] = useState(() => Date.now())
  const now = useNow(1000)
  const loop = (total: number) => total - ((now - start) % total)
  return (
    <Example n={7} title="Compte à rebours du verrouillage" where="Bloc « verrouillage dans » : ramasseur de balles dans la dernière heure, chrono qui clignote dans les 10 dernières minutes.">
      <div className="space-y-4">
        <LockMock label="Dernière heure" ms={loop(55 * 60_000)} />
        <LockMock label="10 dernières minutes" ms={loop(10 * 60_000)} />
      </div>
    </Example>
  )
}

function LockMock({ label, ms }: { label: string; ms: number }) {
  return (
    <div>
      <p className="micro-label mb-2 opacity-80">{label}</p>
      <div className="border-2 border-chalk bg-clay-deep/80">
        <div className="flex items-end justify-between gap-4 px-4 pt-4">
          <div>
            <p className="micro-label">2e tour · verrouillage dans</p>
            <p className="mt-2 text-sm text-chalk/85">Heure locale : vendredi 9 octobre à 05:00</p>
          </div>
          <ShotClock ms={ms} />
        </div>
        <BallBoyRun className="mt-2" />
      </div>
    </div>
  )
}

/** Final order: Robin just climbed from 3rd to 1st. */
const ROWS = [
  { name: "Robin", pts: 140, me: true },
  { name: "nadal", pts: 130 },
  { name: "Valtiebreak", pts: 120 },
  { name: "Carla", pts: 90 },
]

function Ranking() {
  const [k, replay] = useReplay()
  return (
    <Example n={9} title="Classement de la saison" where="Page Saison : podium pour le top 3, et ta ligne qui monte quand tu gagnes des places." replay={replay}>
      <div key={k} className="space-y-4">
        <Box className="px-4 pt-4 pb-3">
          <PixelPodium names={["Robin", "nadal", "Valtiebreak"]} />
        </Box>
        <ol className="border-2 border-chalk/90">
          {ROWS.map((r, i) => (
            <li
              key={r.name}
              className={cn(
                "flex items-center gap-3 border-t-2 border-chalk/50 px-3 py-3 first:border-t-0",
                r.me && "px-climb relative z-10 bg-brick shadow-[inset_4px_0_0_var(--color-chalk)]",
              )}
              style={r.me ? ({ "--from": "112px" } as CSSProperties) : undefined}
            >
              <span className="w-7 shrink-0 text-sm font-bold tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {r.name}
                {r.me && <span className="ml-1.5 text-xs opacity-75">(moi)</span>}
              </span>
              {r.me && (
                <span className="flex items-center gap-1 text-xs font-bold">
                  <ClimbArrow />
                  +2
                </span>
              )}
              <span className="font-display text-2xl tabular-nums">{r.pts}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-chalk/80">
          Ici Robin passe de la 3e à la 1re place (+30 pts) : sa ligne remonte en haut, la flèche continue de pousser.
        </p>
      </div>
    </Example>
  )
}

function Logo() {
  const [k, replay] = useReplay()
  return (
    <Example n={10} title="Service du logo" where="En-tête, déjà actif sur cette page : survole ou touche la balle à côté de « Tennis Fantasy »." replay={replay}>
      <Box className="flex items-center justify-center gap-4 px-4 py-8">
        <BallMark key={k} className={cn("px-serve-ball size-12", k > 0 && "px-serve-now")} />
        <Tag tone="neutral">Survole le logo en haut</Tag>
      </Box>
    </Example>
  )
}
