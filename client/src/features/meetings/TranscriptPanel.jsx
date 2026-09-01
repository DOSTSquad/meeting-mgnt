import { useState } from 'react'

import { hasTranscriptBody } from './transcript.js'

import { CollapsibleSection } from './CollapsibleSection.jsx'

const formatTimestamp = (seconds) => {
  if (typeof seconds !== 'number') {
    return null
  }

  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)

  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

const formatDuration = (seconds) => {
  if (typeof seconds !== 'number' || seconds <= 0) {
    return null
  }

  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60

  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`
}

// A 50 MB recording — the Express upload cap — is roughly an hour of audio, which
// Whisper splits into several hundred segments. Render a page at a time so opening
// the panel never has to lay out the whole transcript at once.
const FIRST_PAGE = 50
const NEXT_PAGE = 100

export const TranscriptPanel = ({ transcript }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(FIRST_PAGE)

  if (!hasTranscriptBody(transcript)) {
    return null
  }

  const segments = Array.isArray(transcript.segments) ? transcript.segments : []
  const text = transcript.transcriptText || ''

  const duration = formatDuration(transcript.durationSeconds)
  const summary = [segments.length > 0 ? `${segments.length} segments` : null, duration]
    .filter(Boolean)
    .join(' · ')

  return (
    <CollapsibleSection
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
      title="Transcript"
      meta={summary}
      description="What the provider heard. Source material, not part of the minutes."
    >
      <div className="mt-3 max-h-80 overflow-y-auto rounded-xl bg-white p-3">
        {segments.length > 0 ? (
          <ul className="space-y-2">
            {segments.slice(0, visibleCount).map((segment, index) => (
              <li key={index} className="flex gap-3 text-xs leading-relaxed">
                <span className="shrink-0 font-mono text-slate-400">
                  {formatTimestamp(segment.startSeconds) ?? '—'}
                </span>
                <span className="text-slate-700">
                  {/* Whisper has no diarization, so speaker is null there. A
                        provider that does identify speakers still renders. */}
                  {segment.speaker ? (
                    <span className="mr-1 font-semibold text-slate-800">{segment.speaker}:</span>
                  ) : null}
                  {segment.text}
                </span>
              </li>
            ))}
            {visibleCount < segments.length ? (
              <li>
                <button
                  type="button"
                  onClick={() => setVisibleCount((count) => count + NEXT_PAGE)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
                >
                  Show more · {segments.length - visibleCount} remaining
                </button>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{text}</p>
        )}
      </div>
    </CollapsibleSection>
  )
}
