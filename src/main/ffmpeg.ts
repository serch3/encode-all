import { spawn, ChildProcess } from 'child_process'
import { BrowserWindow, powerSaveBlocker } from 'electron'
import { createWriteStream, WriteStream, mkdirSync, existsSync, rmSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { createOutputTransaction } from './outputTransaction'
import { encodingIssues } from '../shared/encodingValidation'
import { recordEncodingResult } from './history'
import { createProgressParser } from './ffmpegProgress'
import { join, basename, dirname, extname } from 'path'
import { reservedOutputKey } from './outputPaths'
import { EncodingOptions } from '../preload/api.types'
import {
  buildSinglePassFfmpegArgs,
  buildTwoPassFfmpegArgs,
  canUseTwoPass
} from '../shared/ffmpegArgs'

function sendEvent(window: BrowserWindow, channel: string, payload: unknown): void {
  if (!window.isDestroyed?.() && !window.webContents.isDestroyed?.())
    window.webContents.send(channel, payload)
}

type JobRecord = {
  id: string
  process: ChildProcess | null
  logStream: WriteStream | null
  duration: number
  outputPath: string
  hasPowerSaveBlocker: boolean
  canceled: boolean
  passDirectory?: string
  done: Promise<void>
  finish: () => void
  killTimeout?: ReturnType<typeof setTimeout>
}

const jobs = new Map<string, JobRecord>()
const reservedOutputPaths = new Set<string>()
let powerSaveBlockerId: number | null = null
let powerSaveBlockerRefs = 0

function retainPowerSaveBlocker(): void {
  powerSaveBlockerRefs += 1
  if (powerSaveBlockerId === null) {
    powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension')
  }
}

function releasePowerSaveBlocker(): void {
  powerSaveBlockerRefs = Math.max(0, powerSaveBlockerRefs - 1)
  if (powerSaveBlockerRefs === 0 && powerSaveBlockerId !== null) {
    powerSaveBlocker.stop(powerSaveBlockerId)
    powerSaveBlockerId = null
  }
}

export function cancelEncoding(jobId?: string): void {
  const cancelJob = (job: JobRecord): void => {
    job.canceled = true
    const processToKill = job.process
    if (processToKill) {
      processToKill.kill()
      job.killTimeout = setTimeout(() => {
        if (job.process === processToKill) processToKill.kill('SIGKILL')
      }, 2000)
      job.killTimeout.unref?.()
    }
  }

  if (jobId) {
    const job = jobs.get(jobId)
    if (job) cancelJob(job)
    return
  }

  // Cancel all jobs
  for (const job of jobs.values()) {
    cancelJob(job)
  }
}

export function hasActiveEncodings(): boolean {
  return jobs.size > 0
}

export async function waitForEncodings(): Promise<void> {
  await Promise.all([...jobs.values()].map((job) => job.done))
}

/**
 * Returns a path that does not yet exist on disk.
 * If `filePath` is free it is returned as-is; otherwise _1, _2, … suffixes
 * are tried until a free slot is found.
 */
function resolveUniqueOutputPath(filePath: string): string {
  const dir = dirname(filePath)
  const ext = extname(filePath)
  const base = basename(filePath, ext)

  if (!existsSync(filePath) && !reservedOutputPaths.has(normalizeOutputPath(filePath))) {
    return filePath
  }

  let counter = 1
  let candidate: string
  do {
    candidate = join(dir, `${base}_${counter}${ext}`)
    counter++
  } while (existsSync(candidate) || reservedOutputPaths.has(normalizeOutputPath(candidate)))
  return candidate
}

function reserveOutputPath(filePath: string): string {
  const resolved = resolveUniqueOutputPath(filePath)
  reservedOutputPaths.add(normalizeOutputPath(resolved))
  return resolved
}

function normalizeOutputPath(filePath: string): string {
  return reservedOutputKey(filePath)
}

function closeLogStream(job: JobRecord): void {
  job.logStream?.end()
  job.logStream = null
}

function releaseJobPowerSaveBlocker(job: JobRecord): void {
  if (!job.hasPowerSaveBlocker) return
  job.hasPowerSaveBlocker = false
  releasePowerSaveBlocker()
}

function finalizeJob(job: JobRecord): void {
  if (jobs.get(job.id) !== job) return
  clearTimeout(job.killTimeout)
  closeLogStream(job)
  releaseJobPowerSaveBlocker(job)
  reservedOutputPaths.delete(normalizeOutputPath(job.outputPath))
  jobs.delete(job.id)
  job.finish()
  if (job.passDirectory) {
    try {
      rmSync(job.passDirectory, { recursive: true, force: true })
    } catch (error) {
      console.warn('Could not remove pass statistics:', error)
    }
  }
}

// Helper to run ffmpeg command as promise
function runFfmpegCommand(
  executable: string,
  args: string[],
  mainWindow: BrowserWindow,
  job: JobRecord,
  onProgress: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (job.canceled) {
      reject(new Error('Encoding canceled'))
      return
    }
    job.process = spawn(executable, args, { windowsHide: true })
    let duration = 0
    let recentOutput = ''
    const parseProgress = createProgressParser((record) => {
      if (job.duration > 0)
        onProgress(Math.min(100, Math.round((record.seconds / job.duration) * 100)))
      sendEvent(mainWindow, 'encoding-log', {
        jobId: job.id,
        log: `[${basename(job.outputPath)}] frame=${record.frame} fps=${record.fps} time=${record.time} size=${record.size} speed=${record.speed}\n`
      })
    })
    job.process.stdout?.on('data', (data) => parseProgress(data.toString()))

    job.process.stderr?.on('data', (data) => {
      const str = data.toString()
      recentOutput = (recentOutput + str).slice(-16_000)
      job.logStream?.write(str)
      sendEvent(mainWindow, 'encoding-log', { jobId: job.id, log: str })

      // Parse duration
      if (!duration) {
        const durationMatch = recentOutput.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/)
        if (durationMatch) {
          const hours = parseFloat(durationMatch[1])
          const minutes = parseFloat(durationMatch[2])
          const seconds = parseFloat(durationMatch[3])
          duration = hours * 3600 + minutes * 60 + seconds
          job.duration = job.duration || duration
        }
      }

      // Parse time for progress
      const timeMatch = [...recentOutput.matchAll(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/g)].at(-1)
      if (timeMatch && job.duration > 0) {
        const hours = parseFloat(timeMatch[1])
        const minutes = parseFloat(timeMatch[2])
        const seconds = parseFloat(timeMatch[3])
        const currentTime = hours * 3600 + minutes * 60 + seconds
        const progress = Math.min(100, Math.round((currentTime / job.duration) * 100))
        onProgress(progress)
      }
    })

    job.process.on('close', (code) => {
      job.process = null
      clearTimeout(job.killTimeout)
      if (code === 0 && !job.canceled) {
        resolve()
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${recentOutput.slice(-2000)}`))
      }
    })

    job.process.on('error', (err) => {
      reject(err)
    })
  })
}

export async function startEncoding(
  options: EncodingOptions & { jobId?: string },
  mainWindow: BrowserWindow,
  throwOnError = false
): Promise<string | undefined> {
  const {
    inputPath,
    outputPath,
    videoCodec,
    audioCodec,
    audioChannels,
    audioBitrate,
    volumeDb,
    crf,
    preset,
    threads,
    trackSelection,
    ffmpegPath,
    enableLogging,
    logDirectory,
    jobTimestamp,
    twoPass,
    subtitleMode,
    videoBitrate,
    rateControlMode,
    jobId: maybeJobId
  } = options

  if (maybeJobId && jobs.has(maybeJobId)) throw new Error('A job with this ID is already running.')
  const jobId = maybeJobId || pathHash(`${inputPath}-${outputPath}-${Date.now()}`)
  let resolvedOutputPath = reserveOutputPath(outputPath)
  const startedAt = Date.now()
  let finish!: () => void
  const done = new Promise<void>((resolve) => {
    finish = resolve
  })

  // Create job record
  const job: JobRecord = {
    id: jobId,
    process: null,
    logStream: null,
    duration: options.trimDurationSeconds ?? options.sourceDurationSeconds ?? 0,
    outputPath: resolvedOutputPath,
    hasPowerSaveBlocker: false,
    canceled: false,
    done,
    finish
  }
  jobs.set(jobId, job)

  if (resolvedOutputPath !== outputPath) {
    sendEvent(mainWindow, 'encoding-log', {
      jobId,
      log: `[warn] Output already exists — saving as "${basename(resolvedOutputPath)}" instead.\n`
    })
  }

  const executable = ffmpegPath || 'ffmpeg'
  const effectiveTwoPass = canUseTwoPass({ twoPass, videoCodec, rateControlMode })

  let transaction: Awaited<ReturnType<typeof createOutputTransaction>> | undefined
  try {
    const issues = encodingIssues({ ...options, twoPass: effectiveTwoPass })
    if (issues.length > 0) throw new Error(issues.join(' '))
    if (jobs.get(jobId) !== job) throw new Error('A job with this ID is already running.')
    transaction = await createOutputTransaction(resolvedOutputPath)
    const effectiveOptions: EncodingOptions = {
      ...options,
      inputPath,
      outputPath: resolvedOutputPath,
      container: options.container,
      videoCodec,
      audioCodec,
      audioChannels,
      audioBitrate,
      volumeDb,
      crf,
      preset,
      threads,
      trackSelection,
      ffmpegPath,
      enableLogging,
      logDirectory,
      jobTimestamp,
      twoPass: effectiveTwoPass,
      subtitleMode,
      videoBitrate,
      rateControlMode,
      trimStartSeconds: options.trimStartSeconds,
      trimDurationSeconds: options.trimDurationSeconds
    }

    // Logging setup
    let logPath: string | null = null
    const filename = basename(resolvedOutputPath)

    if (enableLogging) {
      if (logDirectory) {
        if (!existsSync(logDirectory)) {
          mkdirSync(logDirectory, { recursive: true })
        }
        logPath = join(logDirectory, `${filename}.log`)
      } else if (jobTimestamp) {
        const outputDir = dirname(outputPath)
        const logsFolder = join(outputDir, `logs_${jobTimestamp}`)

        if (!existsSync(logsFolder)) {
          mkdirSync(logsFolder, { recursive: true })
        }
        logPath = join(logsFolder, `${filename}.log`)
      } else {
        logPath = `${resolvedOutputPath}.log`
      }
      job.logStream = createWriteStream(logPath)
      job.logStream.on?.('error', (error) => {
        sendEvent(mainWindow, 'encoding-log', { jobId, log: `Logging failed: ${error.message}\n` })
        closeLogStream(job)
      })
    }

    // Prevent system sleep during encoding
    retainPowerSaveBlocker()
    job.hasPowerSaveBlocker = true

    if (twoPass && !effectiveTwoPass) {
      sendEvent(mainWindow, 'encoding-log', {
        jobId,
        log: '[warn] Two-pass encoding requires average bitrate mode with a supported software encoder and was skipped.\n'
      })
    }

    if (effectiveTwoPass) {
      // Pass 1
      sendEvent(mainWindow, 'encoding-log', { jobId, log: 'Starting Pass 1/2...\n' })

      // Each job has isolated pass statistics, including concurrent encodes.
      job.passDirectory = mkdtempSync(join(tmpdir(), 'encode-all-pass-'))
      const passLogPrefix = join(job.passDirectory, 'stats')
      const { pass1Args, pass2Args } = buildTwoPassFfmpegArgs(
        effectiveOptions,
        transaction.path,
        passLogPrefix,
        process.platform === 'win32' ? 'NUL' : '/dev/null'
      )

      await runFfmpegCommand(executable, pass1Args, mainWindow, job, (p) => {
        const total = p / 2
        sendEvent(mainWindow, 'encoding-progress', { jobId, progress: total })
      })

      // Pass 2
      sendEvent(mainWindow, 'encoding-log', { jobId, log: 'Starting Pass 2/2...\n' })

      await runFfmpegCommand(executable, pass2Args, mainWindow, job, (p) => {
        const total = 50 + p / 2
        sendEvent(mainWindow, 'encoding-progress', { jobId, progress: total })
      })
    } else {
      // Single Pass
      const args = buildSinglePassFfmpegArgs(effectiveOptions, transaction.path)

      await runFfmpegCommand(executable, args, mainWindow, job, (p) => {
        sendEvent(mainWindow, 'encoding-progress', { jobId, progress: p })
      })
    }

    // Success
    if (job.canceled) throw new Error('Encoding canceled')
    job.process = null
    let outputSize: number
    for (;;) {
      if (job.canceled) throw new Error('Encoding canceled')
      try {
        outputSize = await transaction.commit(resolvedOutputPath)
        break
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        reservedOutputPaths.delete(normalizeOutputPath(resolvedOutputPath))
        resolvedOutputPath = reserveOutputPath(outputPath)
        job.outputPath = resolvedOutputPath
      }
    }
    await transaction
      .dispose()
      .catch((error) => console.warn('Temporary output cleanup failed:', error))
    transaction = undefined
    await recordEncodingResult(options, resolvedOutputPath, outputSize, startedAt).catch(
      (error) => {
        sendEvent(mainWindow, 'encoding-log', {
          jobId,
          log: `Could not save output history: ${error.message}\n`
        })
      }
    )
    finalizeJob(job)
    sendEvent(mainWindow, 'encoding-complete', {
      jobId,
      outputPath: resolvedOutputPath,
      outputSize,
      elapsedMs: Date.now() - startedAt
    })
    return resolvedOutputPath
  } catch (error) {
    job.process = null
    if (transaction) {
      await transaction
        .dispose()
        .catch((cause) => console.warn('Temporary output cleanup failed:', cause))
      transaction = undefined
    }
    finalizeJob(job)
    const msg = job.canceled
      ? 'Encoding canceled'
      : error instanceof Error
        ? error.message
        : 'Unknown error'
    sendEvent(mainWindow, 'encoding-error', { jobId, error: msg })
    if (throwOnError) throw new Error(msg)
    return undefined
  } finally {
    if (transaction) {
      await transaction.dispose().catch((error) => {
        console.warn('Could not clean temporary output:', error)
      })
    }
    finalizeJob(job)
  }
}

function pathHash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(16)
}
