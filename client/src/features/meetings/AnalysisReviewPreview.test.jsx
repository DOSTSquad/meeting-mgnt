import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AnalysisReviewPreview } from './AnalysisReviewPreview.jsx'

const review = (overrides = {}) => ({
  analysisRun: {
    id: 'run-1',
    status: 'ready_for_review',
    provider: 'fixture',
    model: 'fixture-analysis-v1',
    promptVersion: '2026-08-27',
    summary: 'The team agreed to follow up.',
    keyDiscussions: [{ topic: 'Status', detail: 'Round of updates.', evidence: [] }],
    decisions: [{ decision: 'Follow up next week.', rationale: '', evidence: [] }],
    ...overrides.analysisRun,
  },
  suggestions: overrides.suggestions ?? [
    {
      id: 's1',
      title: 'Circulate the notes',
      priority: 'medium',
      status: 'proposed',
      evidence: [],
    },
    { id: 's2', title: 'Close the open items', priority: 'high', status: 'proposed', evidence: [] },
  ],
})

const expand = () => userEvent.click(screen.getByRole('button', { name: /Generated analysis/ }))

describe('AnalysisReviewPreview', () => {
  it('renders nothing until the run is ready for review', () => {
    const { container } = render(
      <AnalysisReviewPreview review={review({ analysisRun: { status: 'processing' } })} />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('starts collapsed and summarises what was generated', () => {
    render(<AnalysisReviewPreview review={review()} minutes={{}} canApply />)

    expect(screen.getByText(/1 discussions · 1 decisions · 2 suggestions/)).toBeInTheDocument()
    expect(screen.queryByText('The team agreed to follow up.')).not.toBeInTheDocument()
  })

  describe('before applying', () => {
    // applyGeneratedMinuteContent SETs the columns rather than merging, so text a
    // recorder has already written is replaced. The version check guards against
    // someone else's edit, not against losing your own.
    it('warns which minutes fields will be overwritten', () => {
      render(
        <AnalysisReviewPreview
          review={review()}
          minutes={{ content: 'My notes', decisions: 'Agreed X' }}
          canApply
        />
      )

      expect(screen.getByText(/overwritten, not merged/)).toBeInTheDocument()
      expect(screen.getByText(/Minutes, Decisions/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Replace draft minutes' })).toBeInTheDocument()
    })

    it('stays quiet when the minutes are still empty', () => {
      render(<AnalysisReviewPreview review={review()} minutes={{ content: '   ' }} canApply />)

      expect(screen.queryByText(/overwritten, not merged/)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Apply to minutes' })).toBeInTheDocument()
    })

    it('shows the generated sections', async () => {
      render(<AnalysisReviewPreview review={review()} minutes={{}} canApply />)
      await expand()

      expect(screen.getByText('The team agreed to follow up.')).toBeInTheDocument()
      expect(screen.getByText('Follow up next week.')).toBeInTheDocument()
    })
  })

  describe('after applying', () => {
    const applied = { status: 'applied' }

    // The three settled sections are in the minutes fields above; repeating them
    // made the whole card read as outstanding work.
    it('drops the sections that are now in the minutes', async () => {
      render(<AnalysisReviewPreview review={review()} minutes={{}} applyState={applied} canApply />)
      await expand()

      expect(screen.queryByText('The team agreed to follow up.')).not.toBeInTheDocument()
      expect(screen.queryByText('Follow up next week.')).not.toBeInTheDocument()
    })

    // Suggestions never enter the minutes: they become action items one at a
    // time, which is why the card stays at all.
    it('keeps the suggestions, which still need a decision', async () => {
      render(<AnalysisReviewPreview review={review()} minutes={{}} applyState={applied} canApply />)
      await expand()

      expect(screen.getByText('Circulate the notes')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(2)
    })

    it('counts what is left to review rather than what was generated', () => {
      render(<AnalysisReviewPreview review={review()} minutes={{}} applyState={applied} canApply />)

      expect(screen.getByText('2 suggestions to review')).toBeInTheDocument()
    })

    it('says so once every suggestion has been decided', () => {
      const reviewed = review({
        suggestions: [
          { id: 's1', title: 'Circulate', priority: 'low', status: 'accepted', evidence: [] },
          { id: 's2', title: 'Close out', priority: 'low', status: 'rejected', evidence: [] },
        ],
      })
      render(<AnalysisReviewPreview review={reviewed} minutes={{}} applyState={applied} canApply />)

      expect(screen.getByText('all reviewed')).toBeInTheDocument()
    })

    it('does not warn about overwriting again', () => {
      render(
        <AnalysisReviewPreview
          review={review()}
          minutes={{ content: 'Now generated' }}
          applyState={applied}
          canApply
        />
      )

      expect(screen.queryByText(/overwritten, not merged/)).not.toBeInTheDocument()
    })
  })

  it('offers no review controls to someone who cannot manage the meeting', async () => {
    render(<AnalysisReviewPreview review={review()} minutes={{}} canApply={false} />)
    await expand()

    expect(screen.queryByRole('button', { name: /Apply/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument()
  })

  it('accepts a suggestion by id', async () => {
    const onAcceptSuggestion = vi.fn()
    render(
      <AnalysisReviewPreview
        review={review()}
        minutes={{}}
        canApply
        onAcceptSuggestion={onAcceptSuggestion}
      />
    )
    await expand()
    await userEvent.click(screen.getAllByRole('button', { name: 'Accept' })[0])

    expect(onAcceptSuggestion).toHaveBeenCalledWith('s1')
  })
})
