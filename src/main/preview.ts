import { app, shell, type BrowserWindow } from 'electron'
import { mkdtemp, rm, stat } from 'fs/promises'
import { createReadStream } from 'fs'
import { join, extname } from 'path'
import { Readable } from 'stream'
import { randomUUID } from 'crypto'
import { startEncoding, cancelEncoding } from './ffmpeg'
import { runBinary, resolveFfprobePath } from './ffmpegSetup'
import type { PreviewOptions, PreviewResult } from '../preload/api.types'
import { parseByteRange } from './mediaRange'

const previews = new Map<string, { path: string; directory: string }>()
type ActivePreview = { id: string; canceled: boolean; done?: Promise<void> }
let active: ActivePreview | undefined

export function validatePreviewRange(start: number, duration: number): void {
  if (
    !Number.isFinite(start) ||
    start < 0 ||
    !Number.isFinite(duration) ||
    duration < 1 ||
    duration > 30
  ) {
    throw new Error(
      'Preview start must be nonnegative and duration must be between 1 and 30 seconds'
    )
  }
}

export async function createPreview(
  options: PreviewOptions,
  window: BrowserWindow
): Promise<PreviewResult> {
  if (active) throw new Error('A preview is already being encoded')
  validatePreviewRange(options.startSeconds, options.durationSeconds)
  if (!['mp4', 'mkv', 'webm', 'mov'].includes(options.encoding.container))
    throw new Error('Unsupported preview container')
  if (options.encoding.videoCodec === 'copy')
    throw new Error(
      'Stream copy preserves the original quality. Choose a video encoder to preview compression.'
    )
  const record: ActivePreview = { id: `preview-${randomUUID()}`, canceled: false }
  active = record
  let finish!: () => void
  record.done = new Promise<void>((resolve) => {
    finish = resolve
  })
  let directory: string | undefined
  try {
    const probe = await resolveFfprobePath(options.encoding.ffmpegPath)
    const metadata = JSON.parse(
      await runBinary(
        probe,
        [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'json',
          options.encoding.inputPath
        ],
        20_000
      )
    ) as { format?: { duration?: string } }
    const sourceDuration = Number(metadata.format?.duration)
    if (Number.isFinite(sourceDuration) && options.startSeconds >= sourceDuration) {
      throw new Error('Preview start is beyond the end of the video')
    }
    const durationSeconds = Number.isFinite(sourceDuration)
      ? Math.min(options.durationSeconds, sourceDuration - options.startSeconds)
      : options.durationSeconds
    directory = await mkdtemp(join(app.getPath('temp'), 'encode-all-preview-'))
    if (record.canceled) throw new Error('Preview canceled')
    const outputPath = await startEncoding(
      {
        ...options.encoding,
        jobId: record.id,
        outputPath: join(directory, `preview.${options.encoding.container}`),
        trimStartSeconds: options.startSeconds,
        trimDurationSeconds: durationSeconds,
        enableLogging: false,
        logDirectory: undefined,
        jobTimestamp: undefined
      },
      window,
      true
    )
    if (!outputPath || record.canceled)
      throw new Error(
        record.canceled
          ? 'Preview canceled'
          : 'Preview encoding failed. Check the selected codecs, container, and FFmpeg installation.'
      )
    const file = await stat(outputPath)
    previews.set(record.id, { path: outputPath, directory })
    return {
      id: record.id,
      url: `encode-preview://clip/${record.id}`,
      size: file.size,
      durationSeconds
    }
  } catch (error) {
    if (directory) await rm(directory, { recursive: true, force: true })
    throw error
  } finally {
    active = undefined
    finish()
  }
}

export async function cancelPreview(): Promise<void> {
  const record = active
  if (!record) return
  record.canceled = true
  cancelEncoding(record.id)
  await record.done
}

export async function releasePreview(id: string): Promise<void> {
  const preview = previews.get(id)
  if (!preview) return
  previews.delete(id)
  try {
    await rm(preview.directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  } catch (error) {
    previews.set(id, preview)
    throw error
  }
}

export async function openPreview(id: string): Promise<void> {
  const preview = previews.get(id)
  if (!preview) throw new Error('Preview has expired. Generate a new sample.')
  const error = await shell.openPath(preview.path)
  if (error) throw new Error(error)
}

export async function previewResponse(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const preview = url.hostname === 'clip' ? previews.get(url.pathname.slice(1)) : undefined
  if (!preview || !['GET', 'HEAD'].includes(request.method))
    return new Response(null, { status: 404 })
  // Only registered clips are exposed. Electron's file fetch ignores Range headers,
  // so serve explicit byte ranges for media seeking on Windows and other platforms.
  const { size } = await stat(preview.path)
  const requestedRange = request.headers.get('range')
  const range = requestedRange ? parseByteRange(requestedRange, size) : null
  if (requestedRange && !range) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  }
  const types: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska'
  }
  const headers = new Headers({
    'Content-Type': types[extname(preview.path)] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Content-Length': String(range ? range.end - range.start + 1 : size),
    'Cache-Control': 'no-store'
  })
  if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
  const body =
    request.method === 'HEAD' || size === 0
      ? null
      : (Readable.toWeb(
          createReadStream(preview.path, range ?? undefined)
        ) as ReadableStream<Uint8Array>)
  return new Response(body, { status: range ? 206 : 200, headers })
}

export async function cleanupPreviews(): Promise<void> {
  await cancelPreview()
  await Promise.allSettled([...previews.keys()].map(releasePreview))
}
