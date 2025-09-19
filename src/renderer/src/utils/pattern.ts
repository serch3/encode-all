// Utility to build output filenames based on a pattern and token map.
// Tokens use single braces: {name} {codec} {ext} {quality} {channels} {audiobitrate}
// Unknown tokens are left as-is; invalid chars are sanitized at the end.
export interface PatternTokens {
  name: string
  codec: string
  ext: string
  quality?: string
  channels?: string
  audiobitrate?: string
}

const TOKEN_REGEX = /{([a-zA-Z]+)}/g

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
