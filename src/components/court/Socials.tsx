import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"
import { HANDLE_RE, instagramUrl, normaliseHandle, xUrl, type Socials } from "@/lib/supabase"

/* Brand marks (lucide has no brand icons). Monochrome, painted with currentColor. */
export function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/**
 * Normalise both handles of a form; returns an error message when one is invalid.
 */
export function parseSocials(form: { x: string; instagram: string }):
  | { ok: true; value: { x_handle: string | null; instagram_handle: string | null } }
  | { ok: false; error: string } {
  const x = normaliseHandle(form.x)
  const ig = normaliseHandle(form.instagram)
  if (x && !HANDLE_RE.test(x)) return { ok: false, error: "Identifiant X invalide (lettres, chiffres, _ et . ; 30 max)." }
  if (ig && !HANDLE_RE.test(ig)) return { ok: false, error: "Identifiant Instagram invalide (lettres, chiffres, _ et . ; 30 max)." }
  return { ok: true, value: { x_handle: x, instagram_handle: ig } }
}

/** Text input with a fixed "@" prefix, same look as Field. */
export function HandleField({ label, ...props }: ComponentProps<"input"> & { label: string }) {
  return (
    <label className="block">
      <span className="micro-label mb-2">{label}</span>
      <span className="flex h-12 w-full items-center rounded-[2px] border-2 border-chalk/90 bg-brick/25 focus-within:bg-brick/40">
        <span aria-hidden="true" className="pl-3 text-base text-chalk/70">
          @
        </span>
        <input
          type="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={120}
          className="h-full min-w-0 flex-1 bg-transparent pr-3 pl-1 text-base text-chalk placeholder:text-chalk/50 focus:outline-none"
          {...props}
        />
      </span>
    </label>
  )
}

/** Small icon links to a user's public profiles. Clicks don't bubble (rows can be tappable). */
export function SocialIcons({ p, className }: { p: Socials | null | undefined; className?: string }) {
  if (!p || (!p.x_handle && !p.instagram_handle)) return null
  const link = "inline-flex size-6 items-center justify-center rounded-[2px] text-chalk/75 hover:bg-chalk/15 hover:text-chalk"
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-0.5", className)}>
      {p.x_handle && (
        <a href={xUrl(p.x_handle)} target="_blank" rel="noopener noreferrer" aria-label={`X : @${p.x_handle}`} onClick={stop} onKeyDown={stop} className={link}>
          <XIcon className="size-3.5" />
        </a>
      )}
      {p.instagram_handle && (
        <a
          href={instagramUrl(p.instagram_handle)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Instagram : @${p.instagram_handle}`}
          onClick={stop}
          onKeyDown={stop}
          className={link}
        >
          <InstagramIcon className="size-3.5" />
        </a>
      )}
    </span>
  )
}

/** Handles as labelled links (profile page). */
export function SocialLinks({ p }: { p: Socials | null | undefined }) {
  if (!p || (!p.x_handle && !p.instagram_handle)) return null
  const link = "inline-flex min-h-11 items-center gap-2 text-sm font-medium underline underline-offset-4"
  return (
    <p className="flex flex-wrap gap-x-5">
      {p.x_handle && (
        <a href={xUrl(p.x_handle)} target="_blank" rel="noopener noreferrer" className={link}>
          <XIcon className="size-4" />@{p.x_handle}
        </a>
      )}
      {p.instagram_handle && (
        <a href={instagramUrl(p.instagram_handle)} target="_blank" rel="noopener noreferrer" className={link}>
          <InstagramIcon className="size-4" />@{p.instagram_handle}
        </a>
      )}
    </p>
  )
}
