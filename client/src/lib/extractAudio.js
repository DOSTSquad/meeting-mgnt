import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  UnsupportedInputFormatError,
} from 'mediabunny'

import { AudioExtractionError } from './audioExtractionError.js'
import { MAX_UPLOAD_BYTES, extractedAudioName } from './recordingFile.js'

export { AudioExtractionError }

const formatMegabytes = (bytes) => `${(bytes / (1024 * 1024)).toFixed(0)} MB`

const tooLargeError = (bytes, maxBytes) =>
  new AudioExtractionError(
    'too_large',
    `The audio track is about ${formatMegabytes(bytes)}, above the ${formatMegabytes(maxBytes)} upload limit.`
  )

const findAudioTrack = async (input) => {
  try {
    return await input.getPrimaryAudioTrack()
  } catch (error) {
    if (error instanceof UnsupportedInputFormatError) {
      throw new AudioExtractionError(
        'unsupported_format',
        'This video format is not supported. Use MP4, MOV, WebM, or MKV, or upload an audio file.'
      )
    }

    throw error
  }
}

const SAMPLED_PACKETS = 2000

// Sampling a prefix of the packets avoids scanning the whole video just to estimate the size.
const estimateAudioBytes = async (audioTrack) => {
  const [duration, stats] = await Promise.all([
    audioTrack.computeDuration(),
    audioTrack.computePacketStats(SAMPLED_PACKETS),
  ])

  return (stats.averageBitrate * duration) / 8
}

const onWholePercentChange = (onProgress) => {
  let lastPercent = -1

  return (progress) => {
    const percent = Math.floor(progress * 100)

    if (percent !== lastPercent) {
      lastPercent = percent
      onProgress(percent / 100)
    }
  }
}

// Copies the audio packets into an .m4a without decoding, so it is fast and needs no encoder.
export const extractAudio = async (file, { onProgress, maxBytes = MAX_UPLOAD_BYTES } = {}) => {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })

  try {
    const audioTrack = await findAudioTrack(input)

    if (!audioTrack) {
      throw new AudioExtractionError('no_audio_track', 'This video has no audio track.')
    }

    const estimatedBytes = await estimateAudioBytes(audioTrack)

    if (estimatedBytes > maxBytes) {
      throw tooLargeError(estimatedBytes, maxBytes)
    }

    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })
    const conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      video: { discard: true },
      copy: { mode: 'forced' },
      showWarnings: false,
    })

    if (!conversion.isValid) {
      throw new AudioExtractionError(
        'audio_not_copyable',
        'The audio codec of this video cannot be extracted in the browser. Upload an audio file instead.'
      )
    }

    if (onProgress) {
      conversion.onProgress = onWholePercentChange(onProgress)
    }

    await conversion.execute()

    const { buffer } = output.target

    if (buffer.byteLength > maxBytes) {
      throw tooLargeError(buffer.byteLength, maxBytes)
    }

    return new File([buffer], extractedAudioName(file.name), { type: 'audio/mp4' })
  } finally {
    input.dispose()
  }
}
