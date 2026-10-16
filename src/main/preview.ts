import { app, shell, BrowserWindow } from 'electron'
import { mkdtemp, rm, stat } from 'fs/promises'
import { createReadStream } from 'fs'
import { join, extname } from 'path'
import { Readable } from 'stream'
import { randomUUID } from 'crypto'
import { startEncoding, cancelEncoding } from './ffmpeg'
import { runBinary, resolveFfprobePath } from './ffmpegSetup'
import { sourceMediaIssues } from '../shared/mediaValidation'
import { withTargetSize } from '../shared/targetSize'
import type { MediaInfo, PreviewOptions, PreviewResult } from '../preload/api.types'
import { parseByteRange } from './mediaRange'

const previews = new Map<string, { path: string; directory: string; sourcePath: string }>()
const previewWindows = new Map<string, BrowserWindow>()
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
        ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', options.encoding.inputPath],
        20_000
      )
    ) as MediaInfo
    const issues = sourceMediaIssues(options.encoding, metadata)
    if (issues.errors.length) throw new Error(issues.errors.join(' '))
    const sourceDuration = Number(metadata.format?.duration)
    const encoding = withTargetSize(options.encoding, metadata)
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
        ...encoding,
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
    previews.set(record.id, { path: outputPath, directory, sourcePath: options.encoding.inputPath })
    return {
      id: record.id,
      url: `encode-preview://clip/${record.id}`,
      sourceUrl: `encode-preview://clip/${record.id}?source=1`,
      sourceStartSeconds: options.startSeconds,
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
  const player = previewWindows.get(id)
  if (player && !player.isDestroyed()) player.destroy()
  previewWindows.delete(id)
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

export async function openPreviewWindow(id: string, parent: BrowserWindow): Promise<void> {
  if (!previews.has(id)) throw new Error('Preview has expired. Generate a new sample.')
  const existing = previewWindows.get(id)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    return
  }
  const player = new BrowserWindow({
    parent,
    title: 'Quality Preview — Encode All',
    width: 960,
    height: 640,
    minWidth: 480,
    minHeight: 320,
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  previewWindows.set(id, player)
  player.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  player.webContents.on('will-navigate', (event) => event.preventDefault())
  player.on('closed', () => previewWindows.delete(id))
  const url = `encode-preview://clip/${encodeURIComponent(id)}`
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src encode-preview:; style-src 'unsafe-inline'; script-src 'none'"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Quality Preview</title><style>html,body{margin:0;height:100%;background:#09090b;color:#d4d4d8;font-family:system-ui}body{display:flex;flex-direction:column}video{display:block;width:100%;flex:1;min-height:0;object-fit:contain}p{margin:0;padding:12px 16px;font-size:12px;color:#a1a1aa}</style></head><body><video controls preload="auto" aria-label="Encoded quality preview" src="${url}"></video><p>Use the playback controls or fullscreen to inspect the sample. If this format cannot play here, use Open in System Player in the Preview tab.</p></body></html>`
  try {
    await player.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    player.show()
  } catch (error) {
    previewWindows.delete(id)
    if (!player.isDestroyed()) player.destroy()
    throw error
  }
}

export async function previewResponse(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const preview = url.hostname === 'clip' ? previews.get(url.pathname.slice(1)) : undefined
  if (!preview || !['GET', 'HEAD'].includes(request.method))
    return new Response(null, { status: 404 })
  // Only registered clips are exposed. Electron's file fetch ignores Range headers,
  // so serve explicit byte ranges for media seeking on Windows and other platforms.
  const path = url.searchParams.get('source') === '1' ? preview.sourcePath : preview.path
  const { size } = await stat(path)
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
    'Content-Type': types[extname(path).toLowerCase()] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Content-Length': String(range ? range.end - range.start + 1 : size),
    'Cache-Control': 'no-store'
  })
  if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
  const body =
    request.method === 'HEAD' || size === 0
      ? null
      : (Readable.toWeb(createReadStream(path, range ?? undefined)) as ReadableStream<Uint8Array>)
  return new Response(body, { status: range ? 206 : 200, headers })
}

export async function cleanupPreviews(): Promise<void> {
  await cancelPreview()
  await Promise.allSettled([...previews.keys()].map(releasePreview))
}
