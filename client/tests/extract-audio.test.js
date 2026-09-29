import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'

import { AudioExtractionError, extractAudio } from '../src/lib/extractAudio.js'
import { MAX_UPLOAD_BYTES, extractedAudioName, needsExtraction } from '../src/lib/recordingFile.js'

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0

const fileOf = (name, type, bytes = [0]) => new File([new Uint8Array(bytes)], name, { type })

describe('needsExtraction', () => {
  test('video files need extraction, by mime type or extension', () => {
    assert.equal(needsExtraction(fileOf('sync.mp4', 'video/mp4')), true)
    assert.equal(needsExtraction(fileOf('sync.mov', '')), true)
    assert.equal(needsExtraction(fileOf('SYNC.MKV', '')), true)
    assert.equal(needsExtraction(fileOf('sync.webm', 'video/webm')), true)
  })

  test('audio files are uploaded unchanged', () => {
    assert.equal(needsExtraction(fileOf('sync.mp3', 'audio/mpeg')), false)
    assert.equal(needsExtraction(fileOf('sync.wav', 'audio/wav')), false)
    assert.equal(needsExtraction(fileOf('sync.m4a', 'audio/x-m4a')), false)
    assert.equal(needsExtraction(fileOf('audio-only.mp4', 'audio/mp4')), false)
  })

  test('other files do not need extraction', () => {
    assert.equal(needsExtraction(fileOf('notes.txt', 'text/plain')), false)
  })
})

describe('extractedAudioName', () => {
  test('replaces the extension with .m4a', () => {
    assert.equal(extractedAudioName('weekly sync.mp4'), 'weekly sync.m4a')
    assert.equal(extractedAudioName('a.b.mov'), 'a.b.m4a')
  })

  test('handles names without a base name or extension', () => {
    assert.equal(extractedAudioName('clip'), 'clip.m4a')
    assert.equal(extractedAudioName('.mp4'), 'recording.m4a')
  })
})

test('the client limit matches the server upload limit', () => {
  assert.equal(MAX_UPLOAD_BYTES, 50 * 1024 * 1024)
})

test('a file that is not media is rejected as an unsupported format', async () => {
  const file = fileOf('broken.mp4', 'video/mp4', new Array(256).fill(7))

  await assert.rejects(extractAudio(file), (error) => {
    assert.ok(error instanceof AudioExtractionError)
    assert.equal(error.code, 'unsupported_format')
    return true
  })
})

describe('extraction of real media', { skip: !hasFfmpeg && 'ffmpeg is not installed' }, () => {
  let directory
  let withAudio
  let withoutAudio

  const makeVideo = async (name, audioArgs) => {
    const target = path.join(directory, name)
    execFileSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=160x120:rate=10:duration=2',
        ...audioArgs,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-shortest',
        '-y',
        target,
      ],
      { stdio: 'ignore' }
    )

    const bytes = await readFile(target)

    return new File([bytes], name, { type: 'video/mp4' })
  }

  before(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'extract-audio-'))
    withAudio = await makeVideo('with-audio.mp4', [
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2',
      '-c:a',
      'aac',
    ])
    withoutAudio = await makeVideo('without-audio.mp4', ['-an'])
  })

  after(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  test('extracts an audio-only m4a without re-encoding', async () => {
    const progress = []
    const audio = await extractAudio(withAudio, { onProgress: (value) => progress.push(value) })

    assert.equal(audio.name, 'with-audio.m4a')
    assert.equal(audio.type, 'audio/mp4')
    assert.ok(audio.size > 0 && audio.size < withAudio.size)
    assert.equal(progress.at(-1), 1)

    const outputPath = path.join(directory, audio.name)
    await writeFile(outputPath, new Uint8Array(await audio.arrayBuffer()))
    const streams = JSON.parse(
      execFileSync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_type,codec_name',
        '-of',
        'json',
        outputPath,
      ])
    ).streams

    assert.deepEqual(streams, [{ codec_name: 'aac', codec_type: 'audio' }])
  })

  test('rejects a video with no audio track', async () => {
    await assert.rejects(extractAudio(withoutAudio), (error) => {
      assert.equal(error.code, 'no_audio_track')
      return true
    })
  })

  test('rejects audio that is larger than the limit before converting', async () => {
    await assert.rejects(extractAudio(withAudio, { maxBytes: 100 }), (error) => {
      assert.equal(error.code, 'too_large')
      return true
    })
  })
})
