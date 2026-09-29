const KILOBYTE = 1024
const MEGABYTE = KILOBYTE * 1024
const GIGABYTE = MEGABYTE * 1024

export const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return ''
  }

  if (bytes >= GIGABYTE) {
    return `${(bytes / GIGABYTE).toFixed(1)} GB`
  }

  if (bytes >= MEGABYTE) {
    return `${(bytes / MEGABYTE).toFixed(1)} MB`
  }

  return `${Math.max(1, Math.round(bytes / KILOBYTE))} KB`
}
