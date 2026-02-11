import { buildFilenameFromPattern, type PatternTokens } from '../utils/pattern'

describe('buildFilenameFromPattern', () => {
  const baseTokens: PatternTokens = {
    name: 'video',
    codec: 'x265',
    ext: 'mkv'
  }

  test('replaces basic tokens correctly', () => {
    const result = buildFilenameFromPattern('{name}_{codec}.{ext}', baseTokens)
    expect(result).toBe('video_x265.mkv')
  })

  test('handles missing optional tokens', () => {
    const result = buildFilenameFromPattern('{name}_{quality}_{codec}', baseTokens)
    expect(result).toBe('video__x265')
  })

  test('replaces optional tokens when provided', () => {
    const tokens: PatternTokens = {
      ...baseTokens,
      quality: '1080p',
      channels: 'stereo',
      audiobitrate: '128'
    }
    const result = buildFilenameFromPattern(
      '{name}_{quality}_{channels}_{audiobitrate}kbps',
      tokens
    )
    expect(result).toBe('video_1080p_stereo_128kbps')
  })

  test('sanitizes invalid characters', () => {
    const tokens: PatternTokens = {
      name: 'my video file',
      codec: 'x265/hevc',
      ext: 'mkv'
    }
    const result = buildFilenameFromPattern('{name}_{codec}.{ext}', tokens)
    expect(result).toBe('my_video_file_x265_hevc.mkv')
  })

  test('leaves unknown tokens intact', () => {
    const result = buildFilenameFromPattern('{name}_{unknown}_{codec}', baseTokens)
    // Unknown tokens are left as-is, but curly braces are sanitized to underscores
    expect(result).toBe('video__unknown__x265')
  })

  test('handles empty pattern with default', () => {
    const result = buildFilenameFromPattern('', baseTokens)
    expect(result).toBe('video')
  })

  test('handles null-like pattern with default', () => {
    // @ts-expect-error Testing edge case
    const result = buildFilenameFromPattern(null, baseTokens)
    expect(result).toBe('video')
  })

  test('handles pattern with only tokens', () => {
    const result = buildFilenameFromPattern('{name}', baseTokens)
    expect(result).toBe('video')
  })

  test('handles pattern without tokens', () => {
    const result = buildFilenameFromPattern('encoded_file', baseTokens)
    expect(result).toBe('encoded_file')
  })

  test('handles case-insensitive token matching', () => {
    const result = buildFilenameFromPattern('{Name}_{CODEC}_{Ext}', baseTokens)
    expect(result).toBe('video_x265_mkv')
  })

  test('handles multiple spaces and special characters', () => {
    const tokens: PatternTokens = {
      name: 'video@file#test',
      codec: 'x265',
      ext: 'mkv'
    }
    const result = buildFilenameFromPattern('{name} - {codec}.{ext}', tokens)
    expect(result).toBe('video_file_test_-_x265.mkv')
  })

  test('preserves valid characters (letters, numbers, dots, underscores, hyphens)', () => {
    const result = buildFilenameFromPattern('file-name_123.test', baseTokens)
    expect(result).toBe('file-name_123.test')
  })

  test('handles complex pattern with all tokens', () => {
    const tokens: PatternTokens = {
      name: 'movie',
      codec: 'av1',
      ext: 'webm',
      quality: '4k',
      channels: '5.1',
      audiobitrate: '256'
    }
    const result = buildFilenameFromPattern(
      '{name}_{quality}_{codec}_{channels}ch_{audiobitrate}kbps.{ext}',
      tokens
    )
    expect(result).toBe('movie_4k_av1_5.1ch_256kbps.webm')
  })
})
