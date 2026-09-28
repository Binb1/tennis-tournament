import { cn } from "@/lib/utils"

/** The umpire chair, side view: flat, outlined in court-line colour. */
export function UmpireChair({ className }: { className?: string }) {
  // Rungs span the two legs (centre lines x 8.5→13 and 31.5→27 between y 70 and 34).
  const rungs = [44, 54, 64].map((y) => ({ y, x: 8.5 + ((70 - y) * 4.5) / 36 }))
  return (
    <svg viewBox="0 0 40 72" aria-hidden="true" className={cn("block", className)} fill="var(--chair)" stroke="var(--chair-line)" strokeWidth="1.1" strokeLinejoin="round">
      {/* legs + rungs */}
      <path d="M7 70h3l4.5-36h-3zM30 70h3l-4.5-36h-3z" />
      {rungs.map(({ y, x }) => (
        <rect key={y} x={x} y={y - 1.2} width={40 - 2 * x} height="2.4" />
      ))}
      {/* footrest */}
      <rect x="6" y="31" width="28" height="3" />
      {/* seat pod, armrest, backrest */}
      <rect x="10" y="15" width="20" height="16" />
      <rect x="27" y="3" width="4.5" height="14" />
      <rect x="8" y="13" width="22" height="2.6" />
      <path d="M10 25h20" strokeWidth="1.6" />
    </svg>
  )
}
