import { useEffect, useState, type ReactNode } from "react"

/**
 * Per-device memory for one-shot moments (a result animation, last seen rank).
 * localStorage can be missing or throw (private mode): then everything counts as never seen, and nothing breaks.
 */
export function readSeen(key: string): string | null {
  try {
    return localStorage.getItem(`tb:${key}`)
  } catch {
    return null
  }
}

export function writeSeen(key: string, value = "1") {
  try {
    localStorage.setItem(`tb:${key}`, value)
  } catch {
    // ignore
  }
}

/** Renders its children the first time `id` shows up on this device only. */
export function Once({ id, children }: { id: string; children: ReactNode }) {
  return (
    <OnceFor key={id} id={id}>
      {children}
    </OnceFor>
  )
}

function OnceFor({ id, children }: { id: string; children: ReactNode }) {
  const [first] = useState(() => readSeen(id) == null)
  useEffect(() => writeSeen(id), [id])
  return first ? children : null
}
