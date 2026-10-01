const pad = (value) => String(value).padStart(2, '0')

/**
 * Compact elapsed time for a pipeline step: `45s`, `12m 05s`, `1h 02m`.
 * Whole seconds are floored, so a live counter and the final value never disagree, and a
 * negative span (client clock behind the server's) reads as `0s` instead of a negative.
 */
export const formatDuration = (ms) => {
  if (!Number.isFinite(ms)) {
    return ''
  }

  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${pad(minutes)}m`
  }

  if (minutes > 0) {
    return `${minutes}m ${pad(seconds)}s`
  }

  return `${seconds}s`
}
