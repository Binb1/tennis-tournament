import { useEffect, useState } from "react"

import { locale, t } from "@/lib/i18n"

/** Current time, refreshed every `everyMs`. */
export function useNow(everyMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}

/** Time left, in the current language. French: "2 j 5 h", "3 h 12 min", "12 min 05 s" (seconds only under 1 h, and only if `seconds`). */
export function formatLeft(ms: number, seconds = true) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d) return t("time.daysHours", { d, h })
  if (h) return t("time.hoursMinutes", { h, m })
  if (!seconds) return m ? t("time.minutes", { m }) : t("time.underMinute")
  return t("time.minutesSeconds", { m, s: String(s % 60).padStart(2, "0") })
}

/** "14:30" in local time. */
export function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })
}
