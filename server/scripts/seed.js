// Must stay first: ESM hoists imports above ordinary statements, so .env has to
// be loaded by an import, not a call below them. See server/load-env.js.
import '../load-env.js'

import bcrypt from 'bcryptjs'

import { closePool, query } from '../db/postgres.js'
import {
  assertSeedAllowed,
  formatSeedCredentialSummary,
  resolveSeedPassword,
  shouldResetCredentials,
} from './seed-credentials.js'

const SALT_ROUNDS = 10

const usersSeed = [
  {
    name: 'Paveen Anuntakulnatee',
    email: 'paveen.anuntakulnatee@seed.local',
    role: 'admin',
    department: 'operations',
  },
  {
    name: 'Nattanan Thepsathorn',
    email: 'nattanan.thepsathorn@seed.local',
    role: 'staff',
    department: 'operations',
  },
  {
    name: 'Hannah Law',
    email: 'hannah.law@seed.local',
    role: 'staff',
    department: 'operations',
  },
  {
    name: 'Elsie shim',
    email: 'elsie.shim@seed.local',
    role: 'staff',
    department: 'engineering',
  },
  {
    name: 'Jonel Hong',
    email: 'jonel.hong@seed.local',
    role: 'staff',
    department: 'operations',
  },
  {
    name: 'Yuhan Lei',
    email: 'yuhan.lei@seed.local',
    role: 'staff',
    department: 'engineering',
  },
  {
    name: 'Jhow liu',
    email: 'jhow.liu@seed.local',
    role: 'staff',
    department: 'operations',
  },
]

const defaultTags = ['strategy', 'operations', 'engineering']
const meetingTags = [...defaultTags]
const locations = ['Room A / Teams', 'Room B', 'Room C', 'Zoom', 'Board Room']
const statuses = ['scheduled', 'completed']
const participantRoles = ['attendee', 'attendee', 'attendee', 'optional', 'organizer']
const actionStatuses = ['todo', 'in_progress', 'completed']
const actionPriorities = ['low', 'medium', 'high']

const actionTitlePool = [
  'Finalize rollout checklist',
  'Share budget tracker update',
  'Prepare client summary',
  'Confirm integration test plan',
  'Document risk mitigation',
  'Review dependency timeline',
]

const overdueActionItemsSeed = [
  {
    meetingTitle: 'Launch Readiness Check',
    title: 'Resolve launch checklist blocker',
    description: 'Confirm the remaining launch readiness blocker and record the mitigation owner.',
    assigneeEmail: 'paveen.anuntakulnatee@seed.local',
    status: 'in_progress',
    priority: 'high',
    daysOverdue: 4,
  },
  {
    meetingTitle: 'Risk and Compliance Review',
    title: 'Send overdue compliance evidence',
    description: 'Upload the missing compliance evidence package for stakeholder review.',
    assigneeEmail: 'paveen.anuntakulnatee@seed.local',
    status: 'todo',
    priority: 'high',
    daysOverdue: 2,
  },
  {
    meetingTitle: 'Engineering Velocity Sync',
    title: 'Follow up delayed integration test report',
    description: 'Summarize failed integration checks and assign remediation owners.',
    assigneeEmail: 'paveen.anuntakulnatee@seed.local',
    status: 'in_progress',
    priority: 'medium',
    daysOverdue: 1,
  },
]

const meetingDescriptionPool = [
  'Discuss progress, blockers, and upcoming commitments across teams.',
  'Align team priorities and agree on immediate next actions.',
  'Review scope changes, resourcing, and delivery risks.',
  'Capture outcomes and decisions for follow-up execution.',
]

const decisionsPool = [
  'Proceed with phased release next sprint.',
  'Escalate open infra blocker to platform team.',
  'Prioritize API reliability work before feature expansion.',
  'Lock scope for current milestone and defer stretch goals.',
]

const minutesPool = [
  'Reviewed current status and acknowledged schedule pressure in external dependencies.',
  'Confirmed owners for unresolved blockers and aligned expected delivery dates.',
  'Captured action points from team leads and follow-up plan for next meeting.',
  'Agreed meeting cadence and communication protocol for cross-team updates.',
]

const keyDiscussionPool = [
  'Timeline risk and mitigation',
  'Resourcing and ownership',
  'Quality gates before release',
  'Stakeholder communication plan',
]

const meetingNamePool = [
  'Quarterly Ops Review',
  'Engineering Velocity Sync',
  'Product Discovery Huddle',
  'Risk and Compliance Review',
  'Customer Feedback Roundtable',
  'Launch Readiness Check',
  'Cross-Functional Planning',
  'Architecture Decision Forum',
  'Executive Alignment Session',
  'Growth Strategy Workshop',
]

const randomPick = (items) => items[Math.floor(Math.random() * items.length)]

const daysFromNowIso = (dayOffset) => {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + dayOffset)
  date.setUTCHours(17, 0, 0, 0)

  return date.toISOString()
}

const randomPickMany = (items, minCount, maxCount) => {
  const count = Math.min(
    items.length,
    minCount + Math.floor(Math.random() * (maxCount - minCount + 1))
  )
  const copy = [...items]
  const picked = []
  for (let i = 0; i < count; i += 1) {
    const index = Math.floor(Math.random() * copy.length)
    picked.push(copy[index])
    copy.splice(index, 1)
  }
  return picked
}

const buildMeetingsSeed = () => {
  const base = new Date('2026-05-04T00:00:00.000Z')
  const dayOffsets = [-42, -28, -18, -9, -2, 4, 11, 19, 31, 46]
  return Array.from({ length: 10 }, (_, index) => {
    const startsAt = new Date(base)
    startsAt.setUTCDate(base.getUTCDate() + dayOffsets[index % dayOffsets.length])
    startsAt.setUTCHours(0 + (index % 5), 0, 0, 0)
    const endsAt = new Date(startsAt)
    endsAt.setUTCMinutes(60 + (index % 3) * 30)

    return {
      title: meetingNamePool[index % meetingNamePool.length],
      description: randomPick(meetingDescriptionPool),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      timezoneName: 'Australia/Brisbane',
      location: randomPick(locations),
      status: randomPick(statuses),
      facilitatorEmail: randomPick(usersSeed).email.toLowerCase(),
      recorderEmail: randomPick(usersSeed).email.toLowerCase(),
      keyDiscussions: randomPickMany(keyDiscussionPool, 2, 3).join('\n- '),
      decisions: randomPickMany(decisionsPool, 2, 3).join('\n'),
      minutesContent: randomPickMany(minutesPool, 2, 3).join('\n'),
      tag: randomPick(meetingTags),
    }
  })
}

const meetingsSeed = buildMeetingsSeed()

const findExistingSeedEmails = async () => {
  const result = await query('SELECT email FROM users WHERE email = ANY($1::text[])', [
    usersSeed.map((user) => user.email.toLowerCase()),
  ])

  return new Set(result.rows.map((row) => row.email))
}

// An existing account keeps its password and role unless SEED_RESET_PASSWORDS=true, so re-running
// the seed never locks anyone out or demotes an admin.
const seedUsers = async ({ password, resetCredentials }) => {
  const usersByEmail = new Map()
  const existingEmails = await findExistingSeedEmails()
  const appliedEmails = []
  const keptEmails = []

  for (const user of usersSeed) {
    const email = user.email.toLowerCase()
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
    const result = await query(
      `
        INSERT INTO users (name, email, password_hash, role, department)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (email) DO UPDATE
        SET
          name = EXCLUDED.name,
          department = EXCLUDED.department,
          password_hash = CASE WHEN $6::boolean THEN EXCLUDED.password_hash ELSE users.password_hash END,
          role = CASE WHEN $6::boolean THEN EXCLUDED.role ELSE users.role END
        RETURNING id, email
      `,
      [user.name, email, passwordHash, user.role, user.department, resetCredentials]
    )

    usersByEmail.set(result.rows[0].email, result.rows[0].id)
    if (existingEmails.has(email) && !resetCredentials) {
      keptEmails.push(email)
    } else {
      appliedEmails.push(email)
    }
  }

  return { usersByEmail, appliedEmails, keptEmails }
}

const clearPreviousSeedMeetings = async () => {
  await query('DELETE FROM notifications')
  await query('TRUNCATE TABLE meetings RESTART IDENTITY CASCADE')
}

const clearNonSeedUsers = async () => {
  const seedEmails = usersSeed.map((user) => user.email.toLowerCase())
  await query(
    `
      DELETE FROM users
      WHERE email <> ALL($1::text[])
    `,
    [seedEmails]
  )
}

const getTableColumns = async (tableName) => {
  const result = await query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
    `,
    [tableName]
  )

  return new Set(result.rows.map((row) => row.column_name))
}

const insertMinutes = async (
  minutesColumns,
  meeting,
  meetingId,
  defaultCreatorId,
  usersByEmail
) => {
  const minutesRecord = {
    meeting_id: meetingId,
    prepared_by: defaultCreatorId,
    facilitator_id: usersByEmail.get(meeting.facilitatorEmail),
    recorder_id: usersByEmail.get(meeting.recorderEmail),
    content: meeting.minutesContent,
    key_discussions: meeting.keyDiscussions,
    decisions: meeting.decisions,
    body: meeting.minutesContent,
    created_by: defaultCreatorId,
    updated_by: defaultCreatorId,
  }
  const minutesColumnOrder = [
    'meeting_id',
    'prepared_by',
    'facilitator_id',
    'recorder_id',
    'content',
    'key_discussions',
    'decisions',
    'body',
    'created_by',
    'updated_by',
  ]
  const activeColumns = minutesColumnOrder.filter(
    (column) => minutesColumns.has(column) && Object.hasOwn(minutesRecord, column)
  )
  const placeholders = activeColumns.map((_, index) => `$${index + 1}`).join(', ')
  const values = activeColumns.map((column) => minutesRecord[column])

  await query(
    `
      INSERT INTO minutes (${activeColumns.join(', ')})
      VALUES (${placeholders})
    `,
    values
  )
}

const seedMeetings = async (usersByEmail) => {
  const meetingsByTitle = new Map()
  const defaultCreatorId = usersByEmail.get('paveen.anuntakulnatee@seed.local')
  const minutesColumns = await getTableColumns('minutes')

  const tagsByName = new Map()
  for (const tagName of defaultTags) {
    const tagResult = await query(
      `
        INSERT INTO tags (name)
        VALUES ($1)
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id, name
      `,
      [tagName]
    )
    tagsByName.set(tagResult.rows[0].name.toLowerCase(), tagResult.rows[0].id)
  }

  for (const meeting of meetingsSeed) {
    const result = await query(
      `
        INSERT INTO meetings (
          title,
          description,
          starts_at,
          ends_at,
          timezone_name,
          location,
          status,
          owner_id,
          created_by,
          tag_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9)
        RETURNING id, title
      `,
      [
        meeting.title,
        meeting.description,
        meeting.startsAt,
        meeting.endsAt,
        meeting.timezoneName,
        meeting.location,
        meeting.status,
        defaultCreatorId,
        tagsByName.get((meeting.tag || '').toLowerCase()) || null,
      ]
    )

    await insertMinutes(minutesColumns, meeting, result.rows[0].id, defaultCreatorId, usersByEmail)

    meetingsByTitle.set(result.rows[0].title, result.rows[0].id)
  }

  return meetingsByTitle
}

const seedParticipants = async (meetingId, usersByEmail) => {
  const paveenId = usersByEmail.get('paveen.anuntakulnatee@seed.local')
  const allEmails = usersSeed.map((user) => user.email.toLowerCase())
  const otherEmails = allEmails.filter((email) => email !== 'paveen.anuntakulnatee@seed.local')
  const participantEmails = [
    'paveen.anuntakulnatee@seed.local',
    ...randomPickMany(otherEmails, 2, 4),
  ]

  for (const email of participantEmails) {
    await query(
      `
        INSERT INTO meeting_participants (meeting_id, user_id, role, added_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (meeting_id, user_id) DO UPDATE
        SET role = EXCLUDED.role
      `,
      [
        meetingId,
        usersByEmail.get(email),
        email === 'paveen.anuntakulnatee@seed.local' ? 'organizer' : randomPick(participantRoles),
        paveenId,
      ]
    )
  }
}

const seedActionItems = async (meetingsByTitle, usersByEmail) => {
  const createdBy = usersByEmail.get('paveen.anuntakulnatee@seed.local')
  let createdCount = 0

  for (const [meetingTitle, meetingId] of meetingsByTitle.entries()) {
    const participants = await query(
      `
        SELECT user_id
        FROM meeting_participants
        WHERE meeting_id = $1
      `,
      [meetingId]
    )
    const participantIds = participants.rows.map((row) => row.user_id)
    const dueDate = new Date()
    dueDate.setUTCDate(dueDate.getUTCDate() + Math.floor(Math.random() * 14) + 1)

    for (let i = 0; i < 2; i += 1) {
      await query(
        `
          INSERT INTO action_items (
            meeting_id,
            title,
            description,
            assignee_id,
            due_date,
            status,
            priority,
            source,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', $8)
        `,
        [
          meetingId,
          `${randomPick(actionTitlePool)} (${meetingTitle})`,
          randomPick(minutesPool),
          randomPick(participantIds),
          dueDate.toISOString(),
          randomPick(actionStatuses),
          randomPick(actionPriorities),
          createdBy,
        ]
      )

      createdCount += 1
    }
  }

  for (const item of overdueActionItemsSeed) {
    const meetingId = meetingsByTitle.get(item.meetingTitle)
    const assigneeId = usersByEmail.get(item.assigneeEmail)

    if (!meetingId || !assigneeId) {
      continue
    }

    await query(
      `
        INSERT INTO action_items (
          meeting_id,
          title,
          description,
          assignee_id,
          due_date,
          status,
          priority,
          source,
          source_ref,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', 'seed:overdue-demo', $8)
      `,
      [
        meetingId,
        item.title,
        item.description,
        assigneeId,
        daysFromNowIso(-item.daysOverdue),
        item.status,
        item.priority,
        createdBy,
      ]
    )

    createdCount += 1
  }

  return createdCount
}

const seedNotifications = async () => {
  await query(`
    INSERT INTO notifications (
      recipient_user_id,
      type,
      entity_type,
      entity_id,
      title,
      detail,
      event_at,
      idempotency_key
    )
    SELECT DISTINCT
      participant_user_id,
      'meeting_created',
      'meeting',
      id,
      title,
      'A new meeting has been created.',
      created_at,
      'meeting_created:' || id::text
    FROM (
      SELECT
        m.id,
        m.title,
        m.created_at,
        m.created_by AS participant_user_id
      FROM meetings m

      UNION

      SELECT
        m.id,
        m.title,
        m.created_at,
        mp.user_id AS participant_user_id
      FROM meetings m
      JOIN meeting_participants mp ON mp.meeting_id = m.id
    ) meeting_notifications
    ON CONFLICT (recipient_user_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
      DO NOTHING
  `)

  await query(`
    INSERT INTO notifications (
      recipient_user_id,
      type,
      entity_type,
      entity_id,
      title,
      detail,
      event_at,
      idempotency_key
    )
    SELECT
      assignee_id,
      'task_assigned',
      'action_item',
      id,
      title,
      'A task has been assigned to you.',
      updated_at,
      'task_assigned:' || id::text
    FROM action_items
    WHERE assignee_id IS NOT NULL
    ON CONFLICT (recipient_user_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
      DO NOTHING
  `)
}

const main = async () => {
  const { password, generated } = resolveSeedPassword()
  const { usersByEmail, appliedEmails, keptEmails } = await seedUsers({
    password,
    resetCredentials: shouldResetCredentials(),
  })

  await clearPreviousSeedMeetings()
  await clearNonSeedUsers()
  const meetingsByTitle = await seedMeetings(usersByEmail)

  for (const meetingId of meetingsByTitle.values()) {
    await seedParticipants(meetingId, usersByEmail)
  }

  const actionItemCount = await seedActionItems(meetingsByTitle, usersByEmail)
  await seedNotifications()

  console.log('Seed complete:')
  console.log(`- users: ${usersSeed.length}`)
  console.log(`- meetings: ${meetingsSeed.length}`)
  console.log(`- action_items: ${actionItemCount}`)

  formatSeedCredentialSummary({ password, generated, appliedEmails, keptEmails }).forEach((line) =>
    console.log(line)
  )
}

// Checked before anything touches the database.
try {
  assertSeedAllowed()
} catch (error) {
  console.error(error.message)
  process.exit(1)
}

try {
  await main()
} finally {
  await closePool()
}
