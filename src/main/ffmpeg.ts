import { spawn, ChildProcess } from 'child_process'
import { BrowserWindow, powerSaveBlocker } from 'electron'
import { createWriteStream, WriteStream, mkdirSync, existsSync } from 'fs'
import { join, basename, dirname, extname } from 'path'
import { EncodingOptions } from '../preload/api.types'
import {
  buildSinglePassFfmpegArgs,
  buildTwoPassFfmpegArgs,
  canUseTwoPass
} from '../shared/ffmpegArgs'

type JobRecord = {
  id: string
  process: ChildProcess | null
  logStream: WriteStream | null
  duration: number
  outputPath: string
  hasPowerSaveBlocker: boolean
  canceled: boolean
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
    job.process = null
    processToKill?.kill()
    closeLogStream(job)
    releaseJobPowerSaveBlocker(job)
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
  return process.platform === 'win32' ? filePath.toLowerCase() : filePath
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
  closeLogStream(job)
  releaseJobPowerSaveBlocker(job)
  reservedOutputPaths.delete(normalizeOutputPath(job.outputPath))
  jobs.delete(job.id)
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
    job.process = spawn(executable, args)
    let duration = 0

    job.process.stderr?.on('data', (data) => {
      const str = data.toString()
      job.logStream?.write(str)
      mainWindow.webContents.send('encoding-log', { jobId: job.id, log: str })

      // Parse duration
      if (!duration) {
        const durationMatch = str.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/)
        if (durationMatch) {
          const hours = parseFloat(durationMatch[1])
          const minutes = parseFloat(durationMatch[2])
          const seconds = parseFloat(durationMatch[3])
          duration = hours * 3600 + minutes * 60 + seconds
          job.duration = duration
        }
      }

      // Parse time for progress
      const timeMatch = str.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/)
      if (timeMatch && duration > 0) {
        const hours = parseFloat(timeMatch[1])
        const minutes = parseFloat(timeMatch[2])
        const seconds = parseFloat(timeMatch[3])
        const currentTime = hours * 3600 + minutes * 60 + seconds
        const progress = Math.min(100, Math.round((currentTime / duration) * 100))
        onProgress(progress)
      }
    })

    job.process.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`))
      }
    })

    job.process.on('error', (err) => {
      reject(err)
    })
  })
}

export async function startEncoding(
  options: EncodingOptions & { jobId?: string },
  mainWindow: BrowserWindow
): Promise<void> {
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

  const jobId = maybeJobId || pathHash(`${inputPath}-${outputPath}-${Date.now()}`)
  const resolvedOutputPath = reserveOutputPath(outputPath)

  // Create job record
  const job: JobRecord = {
    id: jobId,
    process: null,
    logStream: null,
    duration: 0,
    outputPath: resolvedOutputPath,
    hasPowerSaveBlocker: false,
    canceled: false
  }
  jobs.set(jobId, job)

  if (resolvedOutputPath !== outputPath) {
    mainWindow.webContents.send('encoding-log', {
      jobId,
      log: `[warn] Output already exists — saving as "${basename(resolvedOutputPath)}" instead.\n`
    })
  }

  const executable = ffmpegPath || 'ffmpeg'
  const effectiveTwoPass = canUseTwoPass({ twoPass, videoCodec, rateControlMode })

  try {
    const effectiveOptions: EncodingOptions = {
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
      rateControlMode
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
    }

    // Prevent system sleep during encoding
    retainPowerSaveBlocker()
    job.hasPowerSaveBlocker = true

    if (twoPass && !effectiveTwoPass) {
      mainWindow.webContents.send('encoding-log', {
        jobId,
        log: '[warn] Two-pass encoding requires average bitrate mode and was skipped.\n'
      })
    }

    if (effectiveTwoPass) {
      // Pass 1
      mainWindow.webContents.send('encoding-log', { jobId, log: 'Starting Pass 1/2...\n' })

      // For 2-pass encoding, we need a temp directory for pass stats
      // Use the same strategy as logging, but always create it for 2-pass
      let pass1StatsDir: string
      if (logPath) {
        pass1StatsDir = dirname(logPath)
      } else if (jobTimestamp) {
        const outputDir = dirname(outputPath)
        pass1StatsDir = join(outputDir, `logs_${jobTimestamp}`)
        if (!existsSync(pass1StatsDir)) {
          mkdirSync(pass1StatsDir, { recursive: true })
        }
      } else {
        pass1StatsDir = dirname(outputPath)
      }

      const passLogPrefix = join(pass1StatsDir, `ffmpeg2pass-${pathHash(filename)}`)
      const { pass1Args, pass2Args } = buildTwoPassFfmpegArgs(
        effectiveOptions,
        resolvedOutputPath,
        passLogPrefix,
        process.platform === 'win32' ? 'NUL' : '/dev/null'
      )

      await runFfmpegCommand(executable, pass1Args, mainWindow, job, (p) => {
        const total = p / 2
        mainWindow.webContents.send('encoding-progress', { jobId, progress: total })
        mainWindow.setProgressBar(total / 100)
      })

      // Pass 2
      mainWindow.webContents.send('encoding-log', { jobId, log: 'Starting Pass 2/2...\n' })

      await runFfmpegCommand(executable, pass2Args, mainWindow, job, (p) => {
        const total = 50 + p / 2
        mainWindow.webContents.send('encoding-progress', { jobId, progress: total })
        mainWindow.setProgressBar(total / 100)
      })

      // Cleanup log file? ffmpeg usually handles it or leaves it.
    } else {
      // Single Pass
      const args = buildSinglePassFfmpegArgs(effectiveOptions, resolvedOutputPath)

      await runFfmpegCommand(executable, args, mainWindow, job, (p) => {
        mainWindow.webContents.send('encoding-progress', { jobId, progress: p })
        mainWindow.setProgressBar(p / 100)
      })
    }

    // Success
    job.process = null
    finalizeJob(job)
    mainWindow.webContents.send('encoding-complete', { jobId, outputPath: resolvedOutputPath })
    mainWindow.setProgressBar(-1)
  } catch (error) {
    job.process = null
    finalizeJob(job)
    const msg = job.canceled
      ? 'Encoding canceled'
      : error instanceof Error
        ? error.message
        : 'Unknown error'
    mainWindow.webContents.send('encoding-error', { jobId, error: msg })
    mainWindow.setProgressBar(1, { mode: 'error' })
  }
}

function pathHash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(16)
}
