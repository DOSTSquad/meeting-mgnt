import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

import { config as loadDotenv } from 'dotenv'

import { closePool, query } from '../db/postgres.js'
import { BUCKET_FILES, putObject } from '../services/minio-client.js'

loadDotenv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env'),
  override: true,
})

const textTemplates = [
  'Meeting agenda and context notes for team alignment.',
  'Follow-up notes including owners and due dates.',
  'Summary of decisions and next execution steps.',
  'Risk log update and mitigation checkpoints.',
  'Sprint discussion details and blockers.',
]

const randomPick = (items) => items[Math.floor(Math.random() * items.length)]

const createTextContent = (meetingTitle, index) => {
  const lines = [
    `Meeting: ${meetingTitle}`,
    `Document: Notes ${index + 1}`,
    `Created At: ${new Date().toISOString()}`,
    '',
    randomPick(textTemplates),
    randomPick(textTemplates),
  ]
  return lines.join('\n')
}

const seedFiles = async () => {
  const meetingsRes = await query(
    `
      SELECT id, title, created_by
      FROM meetings
      ORDER BY starts_at ASC, created_at ASC
    `
  )

  const meetings = meetingsRes.rows
  let createdCount = 0

  for (const meeting of meetings) {
    const filesToCreate = 2 + Math.floor(Math.random() * 2)

    for (let index = 0; index < filesToCreate; index += 1) {
      const id = randomUUID()
      const fileName = `${meeting.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-notes-${index + 1}.txt`
      const objectKey = `meetings/${meeting.id}/files/${id}`
      const content = createTextContent(meeting.title, index)
      const buffer = Buffer.from(content, 'utf8')

      await putObject(BUCKET_FILES, objectKey, buffer, buffer.length, {
        'Content-Type': 'text/plain; charset=utf-8',
      })

      await query(
        `
          INSERT INTO meeting_files
            (id, meeting_id, uploaded_by, file_name, mime_type, size_bytes, bucket_name, object_key, description)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          id,
          meeting.id,
          meeting.created_by,
          fileName,
          'text/plain',
          buffer.length,
          BUCKET_FILES,
          objectKey,
          'Dummy seeded text file',
        ]
      )

      createdCount += 1
    }
  }

  console.log('Dummy file seed complete:')
  console.log(`- meetings: ${meetings.length}`)
  console.log(`- files created: ${createdCount}`)
}

try {
  await seedFiles()
} finally {
  await closePool()
}
