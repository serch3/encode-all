/**
 * Token map for building output filenames.
 * All tokens use single braces: {token}
 */
export interface PatternTokens {
  /** Base filename without extension */
  name: string
  /** Video codec identifier (e.g., 'x265', 'x264') */
  codec: string
  /** File extension (e.g., 'mkv', 'mp4') */
  ext: string
  /** Video quality indicator (optional) */
  quality?: string
  /** Audio channel configuration (optional, e.g., 'stereo', '5.1') */
  channels?: string
  /** Audio bitrate in kbps (optional) */
  audiobitrate?: string
}

const TOKEN_REGEX = /{([a-zA-Z]+)}/g

/**
 * Builds an output filename based on a pattern and token map.
 *
 * @param pattern - Pattern string with tokens in braces (e.g., '{name}_{codec}.{ext}')
 * @param tokens - Token values to replace in the pattern
 * @returns Sanitized filename
 *
 */
export function buildFilenameFromPattern(pattern: string, tokens: PatternTokens): string {
  const safePattern = pattern || '{name}'
  const dict: Record<string, string | undefined> = {
    name: tokens.name,
    codec: tokens.codec,
    ext: tokens.ext,
    quality: tokens.quality,
    channels: tokens.channels,
    audiobitrate: tokens.audiobitrate
  }
  const replaced = safePattern.replace(TOKEN_REGEX, (full, key) => {
    const k = key.toLowerCase()
    if (k in dict) {
      return dict[k] ?? ''
    }
    return full // leave unknown token intact
  })
  return replaced.replace(/[^a-zA-Z0-9._-]/g, '_')
}
