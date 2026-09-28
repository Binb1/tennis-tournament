import type { CSSProperties, ReactNode } from "react"
import { ArrowRight } from "lucide-react"
import { Link } from "react-router-dom"

import { SiteHeader } from "@/components/court/AppShell"
import { CourtLine } from "@/components/court/CourtLine"
import { UmpireChair } from "@/components/court/UmpireChair"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"

/**
 * Landing: the page IS a singles court, drawn in portrait at true scale
 * (23.77 m × 8.23 m). Every separator is a real court line.
 *
 *   baseline ───────┬───────  (centre mark)
 *   back court       headline
 *   service line ───┬───────  6.40 m from the net
 *   service boxes    pitch │ CTA
 *   net ════════════╪═══════
 *   service boxes    1     │ 2
 *   service line ───┴───────
 *   back court       3
 *   baseline ───────┴───────  (centre mark)
 */

/** Logged in: straight to the tournaments; otherwise to the login. */
function useEntryHref() {
  const { session } = useAuth()
  return session ? "/tournois" : "/connexion"
}

/* Real court geometry, as % of the court length. */
const LENGTH = 23.77
const WIDTH = 8.23
const SERVICE_FROM_NET = 6.4
const BACK = ((LENGTH / 2 - SERVICE_FROM_NET) / LENGTH) * 100 // 23.075 %
const pct = (n: number) => `${n}%`

export default function Landing() {
  return (
    <div className="surround-surface page-frame relative min-h-svh overflow-x-clip pb-12 text-chalk md:pb-20">
      <Header />
      <main className="px-[30px] pt-8 md:px-4 md:pt-12">
        <Court />
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Header() {
  const href = useEntryHref()
  return (
    <SiteHeader>
      <Link
        to={href}
        className="inline-flex min-h-11 items-center font-sans text-sm font-medium underline decoration-chalk/40 underline-offset-[6px] transition-colors hover:decoration-chalk"
      >
        Se connecter
      </Link>
    </SiteHeader>
  )
}

/* ------------------------------------------------------------------ */

/** A zone of the court, positioned in % of the court box. Content centred. */
function Zone({
  top,
  height,
  left = 0,
  width = 100,
  className,
  children,
  role,
}: {
  top: number
  height: number
  left?: number
  width?: number
  className?: string
  children: ReactNode
  role?: string
}) {
  return (
    <div
      role={role}
      className={cn(
        "absolute flex flex-col items-center justify-center px-[5cqw] text-center",
        className,
      )}
      style={{ top: pct(top), height: pct(height), left: pct(left), width: pct(width) }}
    >
      {children}
    </div>
  )
}

function Court() {
  const serviceTop = BACK
  const serviceBottom = 100 - BACK
  const box = 50 - BACK // service box height, % of length
  const href = useEntryHref()

  return (
    <div
      className="@container court-fill relative mx-auto w-full max-w-[600px]"
      style={{ aspectRatio: `${WIDTH} / ${LENGTH}` } as CSSProperties}
    >
      {/* ---- surface wear (per theme, index.css): scuffed clay, worn grass… ---- */}
      <span aria-hidden="true" className="court-wear pointer-events-none absolute inset-x-[-4%] inset-y-[-3%]" />
      {/* ---- lines ---- */}
      <CourtLine axis="v" className="inset-y-0 left-0" delay={100} />
      <CourtLine axis="v" className="inset-y-0 right-0" delay={100} />
      <CourtLine axis="h" className="inset-x-0 top-0" origin="center" />
      <CourtLine axis="h" className="inset-x-0 bottom-0" origin="center" />
      {/* service lines */}
      <CourtLine axis="h" className="inset-x-0 -translate-y-1/2" style={{ top: pct(serviceTop) }} delay={300} origin="center" />
      <CourtLine axis="h" className="inset-x-0 -translate-y-1/2" style={{ top: pct(serviceBottom) }} delay={300} origin="center" />
      {/* centre service line: between the two service lines only */}
      <CourtLine
        axis="v"
        className="left-1/2 -translate-x-1/2"
        style={{ top: pct(serviceTop), bottom: pct(BACK) }}
        delay={500}
      />
      {/* centre marks */}
      <CourtLine axis="v" className="top-0 left-1/2 h-3 -translate-x-1/2 md:h-4" delay={600} />
      <CourtLine axis="v" className="bottom-0 left-1/2 h-3 -translate-x-1/2 md:h-4" delay={600} origin="end" />
      <Net />
      {/* umpire chair, just outside the sideline at the net */}
      <UmpireChair className="absolute top-1/2 left-full z-10 ml-[2px] w-[25px] -translate-y-1/2 md:ml-4 md:w-[44px]" />

      {/* ---- top half ---- */}
      <Zone top={0} height={BACK}>
        <h1
          className="animate-rise chalk-text font-brand leading-[1.05] whitespace-nowrap text-[calc((100cqw-32px)/6.7)]"
          style={{ animationDelay: "200ms" }}
        >
          Tiebreakers
        </h1>
      </Zone>

      <Zone top={serviceTop} height={box} width={50}>
        <p
          className="animate-rise font-sans text-[clamp(1rem,4.4cqw,1.5rem)] leading-snug font-medium text-balance"
          style={{ animationDelay: "400ms" }}
        >
          Un joueur par tour. Il perd, tu sors.
        </p>
      </Zone>

      <Zone top={serviceTop} height={box} left={50} width={50}>
        <Button
          asChild
          className="animate-rise h-auto w-full max-w-[15rem] flex-col gap-2 rounded-[2px] bg-chalk px-4 py-4 font-sans text-[13px] leading-tight font-bold whitespace-normal uppercase tracking-[0.14em] text-button-ink shadow-none outline outline-1 outline-offset-[3px] outline-chalk/70 [font-stretch:85%] hover:bg-white hover:outline-chalk @md:text-[15px]"
          style={{ animationDelay: "500ms" }}
        >
          <Link to={href}>
            Rejoindre le tournoi
            <ArrowRight className="size-5 transition-transform group-hover/button:translate-x-1" />
          </Link>
        </Button>
      </Zone>

      {/* ---- bottom half ---- */}
      <h2 className="sr-only">Comment ça marche</h2>
      <div role="list">
        <Zone role="listitem" top={50} height={box} width={50}>
          <Step n="1" title="Choisis" text="Avant chaque tour" />
        </Zone>
        <Zone role="listitem" top={50} height={box} left={50} width={50}>
          <Step n="2" title="Survis" text="Jamais deux fois le même" />
        </Zone>
        <Zone role="listitem" top={serviceBottom} height={BACK}>
          <Step n="3" title="Gagne" text="Reste le dernier debout" />
        </Zone>
      </div>
    </div>
  )
}

/**
 * The net, on the net line: chalk top tape over a dark mesh band,
 * a soft shadow on the clay, a post at each sideline (inside the court).
 */
function Net() {
  return (
    <div aria-hidden="true" className="absolute inset-x-0 top-1/2 z-10 h-[14px] -translate-y-1/2 md:h-4">
      {/* cast shadow */}
      <span className="absolute inset-x-0 top-full h-3 bg-linear-to-b from-ink/30 to-transparent" />
      {/* mesh */}
      <span className="net-mesh absolute inset-0" />
      {/* tape */}
      <span className="absolute inset-x-0 top-0 h-[3px] bg-chalk net-tape md:h-1" />
      {/* posts */}
      <span className="absolute -top-1 -bottom-1 left-0 w-[5px] rounded-[1px] bg-ink" />
      <span className="absolute -top-1 -bottom-1 right-0 w-[5px] rounded-[1px] bg-ink" />
    </div>
  )
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <>
      <span className="micro-label">{n}</span>
      <h3 className="chalk-text mt-2 font-display text-[clamp(1.75rem,8.5cqw,3rem)] leading-tight">{title}</h3>
      <p className="mt-1 font-sans text-[clamp(0.875rem,3.6cqw,1.125rem)] leading-snug text-balance text-chalk/85">
        {text}
      </p>
    </>
  )
}
