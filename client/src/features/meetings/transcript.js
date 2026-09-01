/**
 * Whether the transcript has arrived, not merely finished.
 *
 * The workflow stream reports status without content, so a completed transcript
 * is briefly present with an empty body while its fetch is in flight. The panel
 * has nothing to draw then, and the analysis has nothing for its evidence
 * indexes to point at, so both defer to this one predicate rather than each
 * deciding for itself and disagreeing.
 */
export const hasTranscriptBody = (transcript) =>
  transcript?.status === 'completed' &&
  ((Array.isArray(transcript.segments) && transcript.segments.length > 0) ||
    Boolean(transcript.transcriptText))
