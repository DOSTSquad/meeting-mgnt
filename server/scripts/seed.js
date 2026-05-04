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

const meetingsSeed = [
  {
    title: '[Seed] Weekly Leadership Sync',
    description: 'Review delivery risks, budget updates, and hiring priorities.',
    startsAt: '2026-05-05T00:00:00.000Z',
    endsAt: '2026-05-05T01:00:00.000Z',
    timezoneName: 'Australia/Brisbane',
    location: 'Room A / Teams',
    status: 'scheduled',
    department: 'operations',
    tag: 'marketing',
  },
  {
    title: '[Seed] Sprint Planning',
    description: 'Plan sprint goals, estimates, and owners for backlog items.',
    startsAt: '2026-05-06T00:00:00.000Z',
    endsAt: '2026-05-06T01:30:00.000Z',
    timezoneName: 'Australia/Brisbane',
    location: 'Room C',
    status: 'scheduled',
    department: 'engineering',
    tag: 'engineering',
  },
]

const defaultTags = ['marketing', 'engineering', 'software development']

const actionItemsSeed = [
  {
    meetingTitle: '[Seed] Weekly Leadership Sync',
    title: 'Prepare risk register update',
    description: 'Update top 5 risks and mitigation owners before Thursday.',
    assigneeEmail: 'nattanan.thepsathorn@seed.local',
    dueDate: '2026-05-07T00:00:00.000Z',
    priority: 'high',
    status: 'in_progress',
  },
  {
    meetingTitle: '[Seed] Weekly Leadership Sync',
    title: 'Share hiring pipeline summary',
    description: 'Post candidate stage summary in the leadership channel.',
    assigneeEmail: 'jonel.hong@seed.local',
    dueDate: '2026-05-08T00:00:00.000Z',
    priority: 'medium',
    status: 'todo',
  },
  {
    meetingTitle: '[Seed] Sprint Planning',
    title: 'Finalize sprint backlog',
    description: 'Confirm priorities and lock sprint scope after planning.',
    assigneeEmail: 'yuhan.lei@seed.local',
    dueDate: '2026-05-09T00:00:00.000Z',
    priority: 'high',
    status: 'todo',
  },
]

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
          created_by,
          tag_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
        defaultCreatorId,
        tagsByName.get((meeting.tag || '').toLowerCase()) || null,
      ]
    )

    meetingsByTitle.set(result.rows[0].title, result.rows[0].id)
  }

  return meetingsByTitle
}

const seedActionItems = async (meetingsByTitle, usersByEmail) => {
  const createdBy = usersByEmail.get('paveen.anuntakulnatee@seed.local')

  for (const actionItem of actionItemsSeed) {
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
        meetingsByTitle.get(actionItem.meetingTitle),
        actionItem.title,
        actionItem.description,
        usersByEmail.get(actionItem.assigneeEmail),
        actionItem.dueDate,
        actionItem.status,
        actionItem.priority,
        createdBy,
      ]
    )
  }
}

const main = async () => {
  const usersByEmail = await seedUsers()

  await clearPreviousSeedMeetings()
  await clearNonSeedUsers()
  const meetingsByTitle = await seedMeetings(usersByEmail)
  await seedActionItems(meetingsByTitle, usersByEmail)

  console.log('Seed complete:')
  console.log(`- users: ${usersSeed.length}`)
  console.log(`- meetings: ${meetingsSeed.length}`)
  console.log(`- action_items: ${actionItemsSeed.length}`)
  console.log('Sample login: paveen.anuntakulnatee@seed.local / Password123!')
}

try {
  await main()
} finally {
  await closePool()
}
