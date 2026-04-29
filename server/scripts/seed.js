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
    name: 'Alice Chen',
    email: 'alice.chen@seed.local',
    role: 'admin',
    department: 'operations',
  },
  {
    name: 'Ben Carter',
    email: 'ben.carter@seed.local',
    role: 'manager',
    department: 'engineering',
  },
  {
    name: 'Nina Patel',
    email: 'nina.patel@seed.local',
    role: 'staff',
    department: 'finance',
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
  },
]

const actionItemsSeed = [
  {
    meetingTitle: '[Seed] Weekly Leadership Sync',
    title: 'Prepare risk register update',
    description: 'Update top 5 risks and mitigation owners before Thursday.',
    assigneeEmail: 'nina.patel@seed.local',
    dueDate: '2026-05-07T00:00:00.000Z',
    priority: 'high',
    status: 'in_progress',
  },
  {
    meetingTitle: '[Seed] Weekly Leadership Sync',
    title: 'Share hiring pipeline summary',
    description: 'Post candidate stage summary in the leadership channel.',
    assigneeEmail: 'ben.carter@seed.local',
    dueDate: '2026-05-08T00:00:00.000Z',
    priority: 'medium',
    status: 'todo',
  },
  {
    meetingTitle: '[Seed] Sprint Planning',
    title: 'Finalize sprint backlog',
    description: 'Confirm priorities and lock sprint scope after planning.',
    assigneeEmail: 'ben.carter@seed.local',
    dueDate: '2026-05-09T00:00:00.000Z',
    priority: 'high',
    status: 'todo',
  },
]

const seedUsers = async (passwordHash) => {
  const usersByEmail = new Map()

  for (const user of usersSeed) {
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
  await query(`DELETE FROM meetings WHERE title LIKE '[Seed] %'`)
}

const seedMeetings = async (usersByEmail) => {
  const meetingsByTitle = new Map()
  const defaultCreatorId = usersByEmail.get('alice.chen@seed.local')

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
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
      ]
    )

    meetingsByTitle.set(result.rows[0].title, result.rows[0].id)
  }

  return meetingsByTitle
}

const seedActionItems = async (meetingsByTitle, usersByEmail) => {
  const createdBy = usersByEmail.get('alice.chen@seed.local')

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
  const passwordHash = await bcrypt.hash('Password123!', SALT_ROUNDS)
  const usersByEmail = await seedUsers(passwordHash)

  await clearPreviousSeedMeetings()
  const meetingsByTitle = await seedMeetings(usersByEmail)
  await seedActionItems(meetingsByTitle, usersByEmail)

  console.log('Seed complete:')
  console.log(`- users: ${usersSeed.length}`)
  console.log(`- meetings: ${meetingsSeed.length}`)
  console.log(`- action_items: ${actionItemsSeed.length}`)
  console.log('Sample password for seeded users: Password123!')
}

try {
  await main()
} finally {
  await closePool()
}
