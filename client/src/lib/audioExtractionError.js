export class AudioExtractionError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AudioExtractionError'
    this.code = code
  }
}
