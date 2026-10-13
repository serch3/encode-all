import { access, stat } from 'fs/promises'
import { constants } from 'fs'
import { dirname, basename, extname, join, resolve } from 'path'
import type { BatchReviewRequest, BatchReviewEntry } from '../preload/api.types'
import { encodingIssues } from '../shared/encodingValidation'
import { filePathKey } from '../shared/filePaths'
import { runBinary } from './ffmpegSetup'

const key = (path: string): string => filePathKey(resolve(path), process.platform)

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function checkOutputDirectory(path: string): Promise<void> {
  const directory = dirname(path)
  if (!(await exists(directory))) throw new Error('Output folder is unavailable.')
  if (!(await stat(directory)).isDirectory())
    throw new Error('The output location must be a folder.')
  await access(directory, constants.W_OK)
}

export async function reviewBatchOutputs(request: BatchReviewRequest): Promise<BatchReviewEntry[]> {
  if (
    !request ||
    !Array.isArray(request.jobs) ||
    !Array.isArray(request.sourcePaths) ||
    request.sourcePaths.some((path) => typeof path !== 'string')
  )
    throw new Error('Invalid batch review request.')
  const sources = new Set(request.sourcePaths.map(key))
  const planned = new Set<string>()
  const entries: BatchReviewEntry[] = []
  const encoderLists = new Map<string, Promise<string>>()
  for (const job of request.jobs) {
    if (
      !job ||
      typeof job.jobId !== 'string' ||
      typeof job.name !== 'string' ||
      !job.encoding ||
      typeof job.encoding.inputPath !== 'string' ||
      typeof job.encoding.outputPath !== 'string' ||
      !job.encoding.outputPath
    )
      throw new Error('Invalid batch review job.')
    const entry: BatchReviewEntry = {
      jobId: job.jobId,
      name: job.name,
      inputPath: job.encoding.inputPath,
      outputPath: resolve(job.encoding.outputPath),
      encoding: job.encoding,
      errors: encodingIssues(job.encoding, request.supportedNvidiaEncoders),
      warnings: []
    }
    const executable = job.encoding.ffmpegPath || 'ffmpeg'
    if (!encoderLists.has(executable))
      encoderLists.set(executable, runBinary(executable, ['-hide_banner', '-encoders']))
    try {
      const encoders = await encoderLists.get(executable)!
      for (const codec of [job.encoding.videoCodec, job.encoding.audioCodec]) {
        if (codec === 'copy') continue
        const escaped = codec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        if (!new RegExp(`^\\s*[VAS]\\S*\\s+${escaped}\\s`, 'm').test(encoders))
          entry.errors.push(
            `The selected FFmpeg installation does not include ${codec}. Choose another encoder or FFmpeg installation.`
          )
      }
    } catch {
      entry.errors.push(
        'Could not verify FFmpeg encoders. Check the FFmpeg installation before starting this batch.'
      )
    }
    try {
      if (!(await stat(entry.inputPath)).isFile())
        entry.errors.push('The source video is not a file.')
      await access(entry.inputPath, constants.R_OK)
    } catch {
      entry.errors.push(
        'The source video is missing or cannot be read. Restore it or remove it from the queue.'
      )
    }
    if (sources.has(key(entry.outputPath)))
      entry.errors.push(
        'The output path matches a source video. Change the rename pattern or output folder.'
      )
    try {
      await checkOutputDirectory(entry.outputPath)
      const original = entry.outputPath
      const extension = extname(original)
      const name = basename(original, extension)
      let suffix = 1
      while (planned.has(key(entry.outputPath)) || (await exists(entry.outputPath))) {
        entry.outputPath = join(dirname(original), `${name}_${suffix++}${extension}`)
      }
      if (entry.outputPath !== original)
        entry.warnings.push(
          `A numbered filename will be used to keep existing files and other batch outputs: ${basename(entry.outputPath)}.`
        )
      planned.add(key(entry.outputPath))
    } catch {
      entry.errors.push('The output folder cannot be written to. Choose another output folder.')
    }
    entry.encoding = { ...entry.encoding, outputPath: entry.outputPath }
    entries.push(entry)
  }
  return entries
}
