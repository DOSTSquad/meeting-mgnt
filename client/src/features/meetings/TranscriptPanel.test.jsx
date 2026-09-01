import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { TranscriptPanel } from './TranscriptPanel.jsx'

const segment = (index, overrides = {}) => ({
  startSeconds: index * 5,
  endSeconds: index * 5 + 4,
  speaker: null,
  text: `Segment ${index}`,
  ...overrides,
})

const completed = (overrides = {}) => ({
  status: 'completed',
  durationSeconds: 60,
  transcriptText: 'Segment 0',
  segments: [segment(0)],
  ...overrides,
})

describe('TranscriptPanel', () => {
  it('renders nothing while the transcript is still processing', () => {
    const { container } = render(<TranscriptPanel transcript={{ status: 'processing' }} />)

    expect(container).toBeEmptyDOMElement()
  })

  // The workflow stream reports the status without the body, so a completed
  // transcript exists briefly with nothing to show. Rendering an empty panel
  // then would claim the transcript had arrived when it had not.
  it('renders nothing when the body has not arrived yet', () => {
    const { container } = render(
      <TranscriptPanel transcript={{ status: 'completed', segments: [], transcriptText: '' }} />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('summarises the transcript without expanding it', () => {
    render(<TranscriptPanel transcript={completed({ segments: [segment(0), segment(1)] })} />)

    expect(screen.getByText(/2 segments/)).toBeInTheDocument()
    expect(screen.queryByText('Segment 0')).not.toBeInTheDocument()
  })

  it('shows segments with timestamps once expanded', async () => {
    render(<TranscriptPanel transcript={completed({ segments: [segment(0), segment(1)] })} />)

    await userEvent.click(screen.getByRole('button', { name: /Transcript/ }))

    expect(screen.getByText('Segment 0')).toBeInTheDocument()
    expect(screen.getByText('0:05')).toBeInTheDocument()
  })

  // Whisper has no diarization and returns null, so nothing should be printed.
  // A provider that does identify speakers needs no further change.
  it('prints a speaker only when the provider supplies one', async () => {
    render(
      <TranscriptPanel
        transcript={completed({
          segments: [segment(0), segment(1, { speaker: 'Alex' })],
        })}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /Transcript/ }))

    expect(screen.getByText('Alex:')).toBeInTheDocument()
    expect(screen.queryByText('null:')).not.toBeInTheDocument()
  })

  it('pages a long transcript instead of laying all of it out', async () => {
    const segments = Array.from({ length: 60 }, (_, index) => segment(index))
    render(<TranscriptPanel transcript={completed({ segments })} />)

    await userEvent.click(screen.getByRole('button', { name: /Transcript/ }))

    expect(screen.getByText('Segment 49')).toBeInTheDocument()
    expect(screen.queryByText('Segment 50')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Show more/ }))

    expect(screen.getByText('Segment 50')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument()
  })

  it('falls back to the plain text when a provider returns no segments', async () => {
    render(
      <TranscriptPanel
        transcript={completed({ segments: [], transcriptText: 'One block of prose.' })}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /Transcript/ }))

    expect(screen.getByText('One block of prose.')).toBeInTheDocument()
  })
})
