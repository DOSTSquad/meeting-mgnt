import { beforeEach, describe, expect, it, jest } from '@jest/globals'

// Fake query rather than a database: these tests pin that the list SELECT carries the aiStatus
// subquery (and the count query does not) and how the column is serialised. The DB-backed
// 'Meeting list aiStatus' block in meeting.test.js runs the real SQL when RUN_DB_TESTS is set.

const query = jest.fn()

jest.unstable_mockModule('../db/postgres.js', () => ({ query }))

const { findMeetingById, listMeetings } = await import('../repositories/meeting-repository.js')

const baseRow = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Sprint Planning',
  description: null,
  starts_at: new Date('2026-05-01T09:00:00Z'),
  ends_at: new Date('2026-05-01T10:00:00Z'),
  timezone_name: 'UTC',
  location: null,
  status: 'scheduled',
  calendar_sequence: 0,
  tag_id: null,
  tag_name: null,
  owner_id: '22222222-2222-4222-8222-222222222222',
  owner_name: 'Owner',
  created_by: '22222222-2222-4222-8222-222222222222',
  created_at: new Date('2026-04-01T00:00:00Z'),
  updated_at: new Date('2026-04-01T00:00:00Z'),
  file_count: 0,
  file_names: [],
  participant_count: 1,
  participant_names: ['Owner'],
}

const mockListQueries = (rows) => {
  query.mockImplementation(async (text) =>
    text.includes('COUNT(*)::int AS total') ? { rows: [{ total: rows.length }] } : { rows }
  )
}

beforeEach(() => {
  query.mockReset()
})

describe('listMeetings aiStatus', () => {
  it('adds the aiStatus subquery to the list select only', async () => {
    mockListQueries([])

    await listMeetings({ userId: baseRow.owner_id })

    const [countSql] = query.mock.calls[0]
    const [rowsSql] = query.mock.calls[1]

    expect(countSql).not.toContain('ai_status')
    expect(rowsSql).toContain('AS ai_status')
    expect(rowsSql).toContain('archived_at IS NULL')
    expect(rowsSql).toContain('FROM meeting_transcripts')
    expect(rowsSql).toContain('FROM analysis_runs')
    expect(rowsSql).toContain('GROUP BY m.id, t.id, owner.id')
  })

  it.each(['processing', 'failed'])('serialises ai_status %s as aiStatus', async (aiStatus) => {
    mockListQueries([{ ...baseRow, ai_status: aiStatus }])

    const { rows } = await listMeetings()

    expect(rows[0].aiStatus).toBe(aiStatus)
  })

  it.each([null, undefined])('serialises ai_status %s as null', async (aiStatus) => {
    mockListQueries([{ ...baseRow, ai_status: aiStatus }])

    const { rows, total } = await listMeetings()

    expect(rows[0].aiStatus).toBeNull()
    expect(total).toBe(1)
  })
})

describe('findMeetingById', () => {
  it('does not report aiStatus because the detail query does not compute it', async () => {
    query.mockResolvedValue({ rows: [baseRow] })

    const meeting = await findMeetingById(baseRow.id)

    expect(meeting).not.toHaveProperty('aiStatus')
    expect(query.mock.calls[0][0]).not.toContain('ai_status')
  })
})
