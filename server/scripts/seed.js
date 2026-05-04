import path from 'node:path'
import { fileURLToPath } from 'node:url'

import bcrypt from 'bcryptjs'
import { config as loadDotenv } from 'dotenv'

import { closePool, query } from '../db/postgres.js'

loadDotenv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env'),
  override: true,
})

const SALT_ROUNDS = 10

const usersSeed = [
  {
    name: 'Paveen Anuntakulnatee',
    email: 'paveen.anuntakulnatee@seed.local',
    role: 'admin',
    department: 'operations',
    password: 'Password123!',
  },
  {
    name: 'Nattanan Thepsathorn',
    email: 'nattanan.thepsathorn@seed.local',
    role: 'staff',
    department: 'operations',
    password: 'Password123!',
  },
  {
    name: 'Hannah Law',
    email: 'hannah.law@seed.local',
    role: 'staff',
    department: 'operations',
    password: 'Password123!',
  },
  {
    name: 'Elsie shim',
    email: 'elsie.shim@seed.local',
    role: 'staff',
    department: 'engineering',
    password: 'Password123!',
  },
  {
    name: 'Jonel Hong',
    email: 'jonel.hong@seed.local',
    role: 'staff',
    department: 'operations',
    password: 'Password123!',
  },
  {
    name: 'Yuhan Lei',
    email: 'yuhan.lei@seed.local',
    role: 'staff',
    department: 'engineering',
    password: 'Password123!',
  },
  {
    name: 'Jhow liu',
    email: 'jhow.liu@seed.local',
    role: 'staff',
    department: 'operations',
    password: 'Password123!',
  },
]

const defaultTags = ['strategy', 'operations', 'engineering']
const meetingTags = [...defaultTags]
const departments = ['operations', 'engineering', 'finance', 'product']
const locations = ['Room A / Teams', 'Room B', 'Room C', 'Zoom', 'Board Room']
const statuses = ['scheduled', 'in_progress', 'completed']
const participantRoles = ['attendee', 'attendee', 'attendee', 'optional', 'organizer']
const rsvpStatuses = ['pending', 'accepted', 'declined']
const actionStatuses = ['todo', 'in_progress', 'blocked', 'completed']
const actionPriorities = ['low', 'medium', 'high']

const actionTitlePool = [
  'Finalize rollout checklist',
  'Share budget tracker update',
  'Prepare client summary',
  'Confirm integration test plan',
  'Document risk mitigation',
  'Review dependency timeline',
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

const randomPickMany = (items, minCount, maxCount) => {
  const count = Math.min(items.length, minCount + Math.floor(Math.random() * (maxCount - minCount + 1)))
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
      department: randomPick(departments),
      facilitator: randomPick(usersSeed).name,
      recorder: randomPick(usersSeed).name,
      keyDiscussions: randomPickMany(keyDiscussionPool, 2, 3).join('\n- '),
      meetingMinutes: randomPickMany(minutesPool, 2, 3).join('\n'),
      decisions: randomPickMany(decisionsPool, 2, 3).join('\n'),
      tag: randomPick(meetingTags),
    }
  })
}

const meetingsSeed = buildMeetingsSeed()

const seedUsers = async () => {
  const usersByEmail = new Map()

  for (const user of usersSeed) {
    const passwordHash = await bcrypt.hash(user.password, SALT_ROUNDS)
    const result = await query(
      `
        INSERT INTO users (name, email, password_hash, role, department)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (email) DO UPDATE
        SET
          name = EXCLUDED.name,
          password_hash = EXCLUDED.password_hash,
          role = EXCLUDED.role,
          department = EXCLUDED.department
        RETURNING id, email
      `,
      [user.name, user.email.toLowerCase(), passwordHash, user.role, user.department]
    )

    usersByEmail.set(result.rows[0].email, result.rows[0].id)
  }

  return usersByEmail
}

const clearPreviousSeedMeetings = async () => {
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

const seedMeetings = async (usersByEmail) => {
  const meetingsByTitle = new Map()
  const defaultCreatorId = usersByEmail.get('paveen.anuntakulnatee@seed.local')

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
          department,
          facilitator,
          recorder,
          key_discussions,
          meeting_minutes,
          decisions,
          created_by,
          tag_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
        meeting.department,
        meeting.facilitator,
        meeting.recorder,
        meeting.keyDiscussions,
        meeting.meetingMinutes,
        meeting.decisions,
        defaultCreatorId,
        tagsByName.get((meeting.tag || '').toLowerCase()) || null,
      ]
    )

    meetingsByTitle.set(result.rows[0].title, result.rows[0].id)
  }

  return meetingsByTitle
}

const seedParticipants = async (meetingId, usersByEmail) => {
  const paveenId = usersByEmail.get('paveen.anuntakulnatee@seed.local')
  const allEmails = usersSeed.map((user) => user.email.toLowerCase())
  const otherEmails = allEmails.filter((email) => email !== 'paveen.anuntakulnatee@seed.local')
  const participantEmails = ['paveen.anuntakulnatee@seed.local', ...randomPickMany(otherEmails, 2, 4)]

  for (const email of participantEmails) {
    await query(
      `
        INSERT INTO meeting_participants (meeting_id, user_id, role, rsvp_status, added_by)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (meeting_id, user_id) DO UPDATE
        SET role = EXCLUDED.role, rsvp_status = EXCLUDED.rsvp_status
      `,
      [
        meetingId,
        usersByEmail.get(email),
        email === 'paveen.anuntakulnatee@seed.local' ? 'organizer' : randomPick(participantRoles),
        email === 'paveen.anuntakulnatee@seed.local' ? 'accepted' : randomPick(rsvpStatuses),
        paveenId,
      ]
    )
  }
}

const seedActionItems = async (meetingsByTitle, usersByEmail) => {
  const createdBy = usersByEmail.get('paveen.anuntakulnatee@seed.local')
  const userIds = Array.from(usersByEmail.values())

  for (const [meetingTitle, meetingId] of meetingsByTitle.entries()) {
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
          randomPick(userIds),
          dueDate.toISOString(),
          randomPick(actionStatuses),
          randomPick(actionPriorities),
          createdBy,
        ]
      )
    }
  }
}

const main = async () => {
  const usersByEmail = await seedUsers()

  await clearPreviousSeedMeetings()
  await clearNonSeedUsers()
  const meetingsByTitle = await seedMeetings(usersByEmail)

  for (const meetingId of meetingsByTitle.values()) {
    await seedParticipants(meetingId, usersByEmail)
  }

  await seedActionItems(meetingsByTitle, usersByEmail)

  console.log('Seed complete:')
  console.log(`- users: ${usersSeed.length}`)
  console.log(`- meetings: ${meetingsSeed.length}`)
  console.log(`- action_items: ${meetingsSeed.length * 2}`)
  console.log('Sample login: paveen.anuntakulnatee@seed.local / Password123!')
}

try {
  await main()
} finally {
  await closePool()
}
