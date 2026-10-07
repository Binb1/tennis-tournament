import { useState, type ComponentProps, type ReactNode } from "react"
import { Link, NavLink } from "react-router-dom"
import { Eye, EyeOff } from "lucide-react"

import { BallMark } from "@/components/court/BallMark"
import { SurfaceMenu } from "@/components/court/SurfacePicker"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"

/**
 * Clay-court building blocks for the app screens.
 * Structure is drawn with chalk lines; the net separates the header from the play area.
 */

export function AppShell({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  const { profile } = useAuth()
  return (
    <div className="page-surface flex min-h-svh flex-col overflow-x-clip text-chalk">
      <SiteHeader>
        {!bare && (
          <nav className="flex gap-3 text-sm font-medium min-[400px]:gap-4">
            <NavItem to="/tournois">Tournois</NavItem>
            <NavItem to="/saison">Saison</NavItem>
            <NavItem to="/profil">Profil</NavItem>
            {profile?.is_admin && <NavItem to="/admin">Admin</NavItem>}
          </nav>
        )}
      </SiteHeader>
      <main className="mx-auto w-full max-w-[600px] flex-1 px-4 pt-5 pb-16 md:pt-8">{children}</main>
      <SiteFooter />
    </div>
  )
}

/**
 * The backdrop wall behind the baseline: the header on every page,
 * then a thin band in the tournament colours. Wordmark stays in Shrikhand (brand).
 */
export function SiteHeader({ children }: { children?: ReactNode }) {
  const { session } = useAuth()
  return (
    <header className="relative z-20">
      <div className="wall">
        <div className="mx-auto flex max-w-[600px] items-center justify-between gap-2 px-4 py-1.5 md:py-4">
          <Link to={session ? "/tournois" : "/"} className="flex min-h-11 shrink-0 items-center gap-2 font-brand text-lg leading-none min-[400px]:text-xl">
            <BallMark />
            Tiebreakers
          </Link>
          <div className="flex items-center gap-2 min-[400px]:gap-3">
            {children}
            <SurfaceMenu />
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="wall-band" />
    </header>
  )
}

/** The stadium's far wall, mirrored at the bottom: the tournament band, then the wall. */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("relative z-10", className)}>
      <div aria-hidden="true" className="wall-band rotate-180" />
      <div className="wall flex h-16 items-center justify-center">
        <span className="font-brand text-sm leading-none opacity-45">Tiebreakers</span>
      </div>
    </footer>
  )
}

function NavItem({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "inline-flex min-h-11 items-center underline-offset-[6px] transition-colors hover:underline",
          isActive ? "underline decoration-chalk decoration-2" : "decoration-chalk/40",
        )
      }
    >
      {children}
    </NavLink>
  )
}

/** Page title in Shrikhand, with an optional eyebrow, then the net. */
export function PageTitle({ eyebrow, children, aside }: { eyebrow?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-6">
      {eyebrow && <span className="micro-label mb-2">{eyebrow}</span>}
      <div className="flex items-end justify-between gap-4">
        <h1 className="chalk-text min-w-0 font-display text-[2.25rem] [overflow-wrap:anywhere] leading-[1.05] text-balance md:text-5xl">{children}</h1>
        {aside}
      </div>
      <Net className="mt-5" />
    </div>
  )
}

/** The net: chalk tape over a dark mesh band, a post at each end. The key separator. */
export function Net({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("relative h-[12px]", className)}>
      <span className="absolute inset-x-0 top-full h-2.5 bg-linear-to-b from-ink/25 to-transparent" />
      <span className="net-mesh absolute inset-0" />
      <span className="absolute inset-x-0 top-0 h-[3px] bg-chalk net-tape" />
      <span className="absolute -top-1 -bottom-1 left-0 w-[4px] rounded-[1px] bg-ink" />
      <span className="absolute -top-1 -bottom-1 right-0 w-[4px] rounded-[1px] bg-ink" />
    </div>
  )
}

/** A court box: chalk-outlined rectangle. */
export function Box({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("border-2 border-chalk/90", className)} {...props} />
}

/** Chalk button, same as the landing CTA. */
export function ChalkButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-[2px] bg-chalk px-5 py-3 text-[13px] font-bold tracking-[0.14em] text-button-ink uppercase outline outline-1 outline-offset-[3px] outline-chalk/70 transition-colors [font-stretch:85%] hover:bg-white disabled:opacity-60",
        className,
      )}
      {...props}
    />
  )
}

/** Line-only button, for secondary actions. */
export function LineButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-[2px] border-2 border-chalk/90 px-4 py-2 text-[13px] font-bold tracking-[0.14em] uppercase transition-colors [font-stretch:85%] hover:bg-chalk/10 disabled:opacity-60",
        className,
      )}
      {...props}
    />
  )
}

export function Field({ label, hint, ...props }: ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="micro-label mb-2">{label}</span>
      <input
        className="h-12 w-full rounded-[2px] border-2 border-chalk/90 bg-brick/25 px-3 text-base text-chalk placeholder:text-chalk/50 focus:bg-brick/40 focus:outline-none"
        {...props}
      />
      {hint && <span className="mt-1.5 block text-xs text-chalk/75">{hint}</span>}
    </label>
  )
}

/** Password input with a show/hide toggle, same look as Field. */
export function PasswordField({ label, hint, ...props }: Omit<ComponentProps<"input">, "type"> & { label: string; hint?: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <div>
      <label className="block">
        <span className="micro-label mb-2">{label}</span>
        <span className="relative block">
          <input
            type={visible ? "text" : "password"}
            className="h-12 w-full rounded-[2px] border-2 border-chalk/90 bg-brick/25 pr-12 pl-3 text-base text-chalk placeholder:text-chalk/50 focus:bg-brick/40 focus:outline-none"
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 inline-flex w-12 items-center justify-center text-chalk/80 hover:text-chalk"
          >
            {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </span>
      </label>
      {hint && <span className="mt-1.5 block text-xs text-chalk/75">{hint}</span>}
    </div>
  )
}

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <p role="status" className="micro-label py-10 text-center">
      {label}
    </p>
  )
}

/** Inline error (RPC messages are already in French). */
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start justify-between gap-3 border-l-4 border-chalk bg-brick/60 px-4 py-3 text-sm">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="-my-3 min-h-11 shrink-0 font-bold underline underline-offset-4">
          Réessayer
        </button>
      )}
    </div>
  )
}

/** Status tag. */
export function Tag({ tone, children }: { tone: "alive" | "out" | "win" | "neutral" | "alert"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[2px] px-2 py-0.5 text-[11px] font-bold tracking-[0.12em] whitespace-nowrap uppercase [font-stretch:85%]",
        tone === "alive" && "bg-canvas text-chalk",
        tone === "out" && "bg-brick text-chalk-dim",
        tone === "win" && "bg-ball text-ink",
        tone === "neutral" && "border border-chalk/80 text-chalk",
        tone === "alert" && "bg-ink text-ball",
      )}
    >
      {children}
    </span>
  )
}

/**
 * A tennis player's result in one round: Qualifié / Éliminé / À jouer.
 * Passive label (dot + text), so it never looks like a button.
 */
export function ResultTag({ result }: { result: "won" | "lost" | null | undefined }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-[10px] font-bold tracking-[0.1em] whitespace-nowrap uppercase [font-stretch:85%]",
        result === "lost" ? "text-chalk/70" : "text-chalk/90",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          result === "won" && "bg-ball",
          result === "lost" && "bg-ink/70",
          !result && "border border-chalk/80",
        )}
      />
      {result === "won" ? "Qualifié" : result === "lost" ? "Éliminé" : "À jouer"}
    </span>
  )
}
