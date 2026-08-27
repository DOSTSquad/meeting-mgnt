const SEGMENT_SECONDS = 20

// Stable, provider-independent output. The fixture ignores the audio contents,
// but still consumes the stream so callers exercise the same streaming path a
// real speech-to-text adapter will use.
const FIXTURE_SEGMENTS = [
  'Thanks for joining. Let us start with the status update.',
  'The recording workflow processed this meeting with the fixture transcription adapter.',
  'We agreed to follow up on the open items before the next meeting.',
]

const drainAudioStream = async (audioStream) => {
  if (!audioStream) {
    throw new Error('Transcription requires an audio stream')
  }

  let byteLength = 0

  for await (const chunk of audioStream) {
    byteLength += chunk.length
  }

  return byteLength
}

export const createFixtureTranscriptionAdapter = () => ({
  name: 'fixture',

  transcribe: async ({ audioStream }) => {
    const audioByteLength = await drainAudioStream(audioStream)

    const segments = FIXTURE_SEGMENTS.map((text, index) => ({
      startSeconds: index * SEGMENT_SECONDS,
      endSeconds: (index + 1) * SEGMENT_SECONDS,
      speaker: `Speaker ${index + 1}`,
      text,
    }))

    return {
      text: FIXTURE_SEGMENTS.join(' '),
      segments,
      durationSeconds: segments.length * SEGMENT_SECONDS,
      audioByteLength,
    }
  },
})
