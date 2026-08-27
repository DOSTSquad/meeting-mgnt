// Must stay first: ESM hoists imports above ordinary statements, so .env has to
// be loaded by an import, not a call below them. See server/load-env.js.
import '../load-env.js'

import { closePool, query } from '../db/postgres.js'

const TASK_SOURCE_REF = 'dummy-assigned-task-seed-v1'

const taskTitles = [
  'Prepare follow-up summary',
  'Confirm owner updates',
  'Share progress update',
  'Review open blockers',
  'Validate meeting outcomes',
  'Coordinate next actions',
]

const randomPick = (items) => items[Math.floor(Math.random() * items.length)]

const randomPickMany = (items, min, max) => {
  const count = min + Math.floor(Math.random() * (max - min + 1))
  const copy = [...items]
  const selected = []

  for (let i = 0; i < Math.min(count, copy.length); i += 1) {
    const index = Math.floor(Math.random() * copy.length)
    selected.push(copy[index])
    copy.splice(index, 1)
  }

  return selected
}

const addDaysIso = (days) => {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

const seedAssignedTasks = async () => {
  await query(
    `
      DELETE FROM action_items
      WHERE source_ref = $1
    `,
    [TASK_SOURCE_REF]
  )

  const usersResult = await query(
    `
      SELECT id, name, email
      FROM users
      ORDER BY created_at ASC
    `
  )

  let createdCount = 0

  for (const user of usersResult.rows) {
    const meetingsResult = await query(
      `
        SELECT m.id, m.title, m.created_by, m.starts_at, m.created_at
        FROM meetings m
        LEFT JOIN meeting_participants mp ON mp.meeting_id = m.id
        WHERE m.created_by = $1 OR mp.user_id = $1
        GROUP BY m.id, m.title, m.created_by, m.starts_at, m.created_at
        ORDER BY m.starts_at ASC, m.created_at ASC
      `,
      [user.id]
    )

    const accessibleMeetings = meetingsResult.rows
    if (accessibleMeetings.length === 0) {
      continue
    }

    const meetingsForTasks = randomPickMany(accessibleMeetings, 2, 3)

    for (const [index, meeting] of meetingsForTasks.entries()) {
      const dueDateOffset =
        index % 2 === 0 ? -(1 + Math.floor(Math.random() * 6)) : 2 + Math.floor(Math.random() * 10)
      await query(
        `
          INSERT INTO action_items (
            meeting_id,
            title,
            description,
            assignee_id,
            due_date,
            status,
            source,
            source_ref,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, 'todo', 'manual', $6, $7)
        `,
        [
          meeting.id,
          `${randomPick(taskTitles)} (${meeting.title})`,
          `Auto-generated assigned task for ${user.name}.`,
          user.id,
          addDaysIso(dueDateOffset),
          TASK_SOURCE_REF,
          meeting.created_by,
        ]
      )

      createdCount += 1
    }
  }

  console.log('Assigned task seed complete:')
  console.log(`- users processed: ${usersResult.rows.length}`)
  console.log(`- tasks created: ${createdCount}`)
}

try {
  await seedAssignedTasks()
} finally {
  await closePool()
}
