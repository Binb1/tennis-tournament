import { Languages } from "lucide-react"

import { LANGS, setLang, t, useLang, type Lang } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** FR / EN / ES: a native select (phone pickers for free), shown as the short code. Saved on this device. */
export function LangSwitch({ className }: { className?: string }) {
  const lang = useLang()
  return (
    <label className={cn("relative flex min-h-11 items-center gap-1 text-xs font-bold tracking-[0.12em] [font-stretch:85%]", className)}>
      <Languages className="size-4 opacity-80" aria-hidden="true" />
      <span aria-hidden="true">{LANGS.find((l) => l.id === lang)!.label}</span>
      <select
        aria-label={t("lang.label")}
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className="absolute inset-0 cursor-pointer opacity-0 [&>option]:text-ink"
      >
        {LANGS.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  )
}
