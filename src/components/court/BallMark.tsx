import { cn } from "@/lib/utils"

/** Ball mark: a ball cut into three pieces by its seam. The one place ball-yellow appears. */
export function BallMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" fill="var(--color-ball)" className={cn("size-5 shrink-0", className)}>
      <path d="M24.44 61.03A30 30 0 0 1 3.63 22.24A3 3 0 0 1 7.68 20.47A43.1 43.1 0 0 0 52.32 14.34A3 3 0 0 1 56.69 14.95A30 30 0 0 1 60.5 22.64A3 3 0 0 1 58.2 26.53A37.1 37.1 0 0 0 28.17 58.49A3 3 0 0 1 24.44 61.03Z" />
      <path d="M10.98 10.6A30 30 0 0 1 46.48 5.72A3 3 0 0 1 46.8 10.77A36.9 36.9 0 0 1 12.03 15.54A3 3 0 0 1 10.98 10.6Z" />
      <path d="M61.7 36.24A30 30 0 0 1 38.08 61.38A3 3 0 0 1 34.52 57.95A30.9 30.9 0 0 1 58.06 32.89A3 3 0 0 1 61.7 36.24Z" />
    </svg>
  )
}
