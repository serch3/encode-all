import { access, stat, statfs, realpath } from 'fs/promises'
import { constants } from 'fs'
import { dirname, basename, extname, join, resolve } from 'path'
import type { BatchReviewRequest, BatchReviewEntry, MediaInfo } from '../preload/api.types'
import { encodingIssues } from '../shared/encodingValidation'
import { runBinary, resolveFfprobePath, getSupportedEncoders } from './ffmpegSetup'
import { sourceMediaIssues } from '../shared/mediaValidation'
import { withTargetSize } from '../shared/targetSize'
import { isHardwareEncoder } from '../shared/encoders'
import { outputPathKey } from './outputPaths'

const key = outputPathKey

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
    request.jobs.length > 20000 ||
    !Array.isArray(request.sourcePaths) ||
    request.sourcePaths.some((path) => typeof path !== 'string')
  )
    throw new Error('Invalid batch review request.')
  const sourceKey = async (path: string): Promise<string> => {
    const canonical = (await realpath(path).catch(() => resolve(path))).normalize('NFC')
    return process.platform === 'win32' ? canonical.toLowerCase() : canonical
  }
  const sources = new Set(await Promise.all(request.sourcePaths.map(sourceKey)))
  const planned = new Set<string>()
  const entries: BatchReviewEntry[] = []
  const encoderLists = new Map<string, Promise<string>>()
  const probes = new Map<string, Promise<MediaInfo>>()
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
    if (isHardwareEncoder(job.encoding.videoCodec) && !entry.errors.length) {
      try {
        if (!(await getSupportedEncoders(executable)).includes(job.encoding.videoCodec))
          entry.errors.push('The selected hardware encoder could not initialize on this device.')
      } catch {
        entry.errors.push('Hardware encoder availability could not be verified.')
      }
    }
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
      const probeKey = `${executable}:${entry.inputPath}`
      if (!probes.has(probeKey))
        probes.set(
          probeKey,
          (async () => {
            const probe = await resolveFfprobePath(job.encoding.ffmpegPath)
            const info = JSON.parse(
              await runBinary(
                probe,
                ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', entry.inputPath],
                20_000
              )
            ) as MediaInfo
            if (!Array.isArray(info.streams)) throw new Error('Invalid source metadata.')
            return info
          })()
        )
      try {
        const media = await probes.get(probeKey)!
        if (job.encoding.targetSizeMb) {
          try {
            entry.encoding = withTargetSize(entry.encoding, media)
            entry.warnings.push(
              `Target ${job.encoding.targetSizeMb} MB per file is approximate; video bitrate will be ${entry.encoding.videoBitrate} kbps.`
            )
          } catch (error) {
            entry.errors.push(
              error instanceof Error ? error.message : 'Could not calculate a target bitrate.'
            )
          }
        }
        entry.encoding = {
          ...entry.encoding,
          sourceDurationSeconds: Number(media.format.duration) || undefined
        }
        const issues = sourceMediaIssues(entry.encoding, media)
        entry.errors.push(...issues.errors)
        entry.warnings.push(...issues.warnings)
      } catch {
        entry.errors.push(
          'Could not inspect source streams. Check that the video is readable and FFprobe is available.'
        )
      }
    } catch {
      entry.errors.push(
        'The source video is missing or cannot be read. Restore it or remove it from the queue.'
      )
    }
    if (sources.has(await sourceKey(entry.outputPath)))
      entry.errors.push(
        'The output path matches a source video. Change the rename pattern or output folder.'
      )
    try {
      await checkOutputDirectory(entry.outputPath)
      const original = entry.outputPath
      const extension = extname(original)
      const name = basename(original, extension)
      let suffix = 1
      while (planned.has(await key(entry.outputPath)) || (await exists(entry.outputPath))) {
        entry.outputPath = join(dirname(original), `${name}_${suffix++}${extension}`)
      }
      if (entry.outputPath !== original)
        entry.warnings.push(
          `A numbered filename will be used to keep existing files and other batch outputs: ${basename(entry.outputPath)}.`
        )
      planned.add(await key(entry.outputPath))
      if (entry.encoding.sourceDurationSeconds && entry.encoding.rateControlMode === 'bitrate') {
        const estimate =
          (entry.encoding.sourceDurationSeconds *
            (entry.encoding.videoBitrate + entry.encoding.audioBitrate) *
            1000) /
          8
        const space = await statfs(dirname(entry.outputPath)).catch(() => null)
        if (space && Number(space.bavail) * Number(space.bsize) < estimate * 1.05)
          entry.errors.push(
            'The destination may not have enough free space for this output. Free space or choose another folder.'
          )
      }
    } catch {
      entry.errors.push('The output folder cannot be written to. Choose another output folder.')
    }
    entry.encoding = { ...entry.encoding, outputPath: entry.outputPath }
    entries.push(entry)
  }
  return entries
}
