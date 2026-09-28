import { useEffect, useState } from "react"

/** Current time, refreshed every `everyMs`. */
export function useNow(everyMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}

/** Time left, French: "2 j 5 h", "3 h 12 min", "12 min 05 s" (seconds only under 1 h, and only if `seconds`). */
export function formatLeft(ms: number, seconds = true) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d) return `${d} j ${h} h`
  if (h) return `${h} h ${m} min`
  if (!seconds) return m ? `${m} min` : "moins d'une minute"
  return `${m} min ${String(s % 60).padStart(2, "0")} s`
}

/** "14:30" in local time. */
export function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
}
