export interface ByteRange {
  start: number
  end: number
}

/** Resolve a single HTTP byte range, including open-ended and suffix ranges. */
export function parseByteRange(header: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || size <= 0 || (!match[1] && !match[2])) return null
  if (!match[1]) {
    const suffix = Number(match[2])
    return Number.isSafeInteger(suffix) && suffix > 0
      ? { start: Math.max(0, size - suffix), end: size - 1 }
      : null
  }
  const start = Number(match[1])
  const end = match[2] ? Number(match[2]) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start)
    return null
  return { start, end: Math.min(end, size - 1) }
}
