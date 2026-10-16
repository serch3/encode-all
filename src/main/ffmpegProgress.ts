export interface FfmpegProgress {
  frame: string
  fps: string
  speed: string
  time: string
  size: string
  seconds: number
}

/** stdout records can span arbitrary pipe chunks; dispatch only complete records. */
export function createProgressParser(
  onRecord: (record: FfmpegProgress) => void
): (chunk: string) => void {
  let pending = ''
  let record: Record<string, string> = {}
  return (chunk) => {
    pending += chunk
    let newline: number
    while ((newline = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, newline).trim()
      pending = pending.slice(newline + 1)
      const separator = line.indexOf('=')
      if (separator < 0) continue
      record[line.slice(0, separator)] = line.slice(separator + 1)
      if (line.startsWith('progress=')) {
        onRecord({
          frame: record.frame ?? '0',
          fps: record.fps ?? '--',
          speed: record.speed ?? '--',
          time: record.out_time ?? '--:--:--',
          size: Number.isFinite(Number(record.total_size))
            ? `${Math.round(Number(record.total_size) / 1024)}KiB`
            : '--',
          seconds: Math.max(0, Number(record.out_time_us) / 1e6 || 0)
        })
        record = {}
      }
    }
    if (pending.length > 8192) pending = ''
  }
}
