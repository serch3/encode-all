import { spawn, ChildProcess } from 'child_process'
import { BrowserWindow, powerSaveBlocker } from 'electron'
import { createWriteStream, WriteStream, mkdirSync, existsSync } from 'fs'
import { join, basename, dirname } from 'path'
import { EncodingOptions } from '../preload/api.types'

type JobRecord = {
  id: string
  process: ChildProcess | null
  logStream: WriteStream | null
  duration: number
  outputPath: string
}

const jobs = new Map<string, JobRecord>()
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
    job.process?.kill()
    job.process = null
    job.logStream?.end()
    job.logStream = null
    releasePowerSaveBlocker()
    jobs.delete(job.id)
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
    logDirectory,
    jobTimestamp,
    twoPass,
    subtitleMode,
    videoBitrate,
    rateControlMode,
    jobId: maybeJobId
  } = options

  const jobId = maybeJobId || pathHash(`${inputPath}-${outputPath}-${Date.now()}`)

  // Create job record
  const job: JobRecord = {
    id: jobId,
    process: null,
    logStream: null,
    duration: 0,
    outputPath
  }
  jobs.set(jobId, job)

  // Base arguments
  const baseArgs = ['-y', '-i', inputPath]

  // Preserve metadata by default
  baseArgs.push('-map_metadata', '0')

  // Common Video Args construction
  const videoArgs: string[] = []
  videoArgs.push('-c:v', videoCodec)
  if (videoCodec !== 'copy') {
    if (rateControlMode === 'bitrate') {
        videoArgs.push('-b:v', `${videoBitrate}k`)
    } else {
        // CRF mode
        if (videoCodec.includes('nvenc')) {
            videoArgs.push('-cq', crf.toString())
        } else {
            videoArgs.push('-crf', crf.toString())
        }
    }
    videoArgs.push('-preset', preset)
  }

  // Audio Args
  const audioArgs: string[] = []
  audioArgs.push('-c:a', audioCodec)
  if (audioCodec !== 'copy') {
    if (audioBitrate > 0) {
      audioArgs.push('-b:a', `${audioBitrate}k`)
    }
    if (audioChannels !== 'same') {
      if (audioChannels === 'mono') audioArgs.push('-ac', '1')
      if (audioChannels === 'stereo') audioArgs.push('-ac', '2')
      if (audioChannels === '5.1') audioArgs.push('-ac', '6')
    }
    if (volumeDb !== 0) {
      audioArgs.push('-filter:a', `volume=${volumeDb}dB`)
    }
  }

  // Subtitle Args
  const subtitleArgs: string[] = []
  if (subtitleMode === 'none') {
    subtitleArgs.push('-sn')
  } else if (subtitleMode === 'copy') {
    // If we are copying, we need to map them.
    subtitleArgs.push('-c:s', 'copy')
  }

  // Common Args (Threads, etc)
  const commonArgs: string[] = []
  if (threads > 0) {
    commonArgs.push('-threads', threads.toString())
  }

  // Track Selection logic to maps
  const mapArgs: string[] = []
  if (trackSelection === 'all') {
    mapArgs.push('-map', '0')
  } else if (trackSelection === 'all_audio') {
    mapArgs.push('-map', '0:v:0', '-map', '0:a')
    // If subtitle mode is copy, include all subtitles
    if (subtitleMode === 'copy') {
      mapArgs.push('-map', '0:s?')
    }
  } else {
    // Auto
    if (subtitleMode === 'copy') {
      // If user picked 'copy' subs but left track selection on Auto,
      // force map all subtitles so they aren't dropped by FFmpeg defaults.
      mapArgs.push('-map', '0:s?')
    }
  }

  // Logging setup
  let logPath: string
  const filename = basename(outputPath)

  if (logDirectory) {
    logPath = join(logDirectory, `${filename}.log`)
  } else if (jobTimestamp) {
    const outputDir = dirname(outputPath)
    const logsFolder = join(outputDir, `logs_${jobTimestamp}`)

    if (!existsSync(logsFolder)) {
      mkdirSync(logsFolder, { recursive: true })
    }
    logPath = join(logsFolder, `${filename}.log`)
  } else {
    logPath = `${outputPath}.log`
  }
  job.logStream = createWriteStream(logPath)

  // Prevent system sleep during encoding
  retainPowerSaveBlocker()

  const executable = ffmpegPath || 'ffmpeg'

  try {
    if (twoPass && videoCodec !== 'copy') {
      // Pass 1
      mainWindow.webContents.send('encoding-log', 'Starting Pass 1/2...\n')
      const passLogPrefix = join(dirname(logPath), `ffmpeg2pass-${pathHash(filename)}`)

      // For Pass 1:
      // - Include video settings (codec, bitrate/crf, preset)
      // - Disable audio (-an) and subtitles (-sn) to speed it up
      // - Force output to NULL (we only care about the stats log)
      const pass1Args = [
        ...baseArgs,
        ...videoArgs,
        '-an',
        '-sn',
        ...commonArgs,
        '-pass', '1',
        '-passlogfile', passLogPrefix,
        '-f', 'null',
        process.platform === 'win32' ? 'NUL' : '/dev/null'
      ]

      await runFfmpegCommand(executable, pass1Args, mainWindow, job, (p) => {
        const total = p / 2
        mainWindow.webContents.send('encoding-progress', { jobId, progress: total })
        mainWindow.setProgressBar(total / 100)
      })

      // Pass 2
      mainWindow.webContents.send('encoding-log', 'Starting Pass 2/2...\n')
      const pass2Args = [
        ...baseArgs,
        ...videoArgs,
        ...audioArgs,
        ...subtitleArgs,
        ...commonArgs,
        ...mapArgs,
        '-pass', '2',
        '-passlogfile', passLogPrefix,
        outputPath
      ]

      await runFfmpegCommand(executable, pass2Args, mainWindow, job, (p) => {
        const total = 50 + p / 2
        mainWindow.webContents.send('encoding-progress', { jobId, progress: total })
        mainWindow.setProgressBar(total / 100)
      })

      // Cleanup log file? ffmpeg usually handles it or leaves it.
    } else {
      // Single Pass
      const args = [
        ...baseArgs,
        ...videoArgs,
        ...audioArgs,
        ...subtitleArgs,
        ...commonArgs,
        ...mapArgs,
        outputPath
      ]

      await runFfmpegCommand(executable, args, mainWindow, job, (p) => {
        mainWindow.webContents.send('encoding-progress', { jobId, progress: p })
        mainWindow.setProgressBar(p / 100)
      })
    }

    // Success
    job.logStream?.end()
    job.logStream = null
    job.process = null
    releasePowerSaveBlocker()
    jobs.delete(jobId)
    mainWindow.webContents.send('encoding-complete', { jobId, outputPath })
    mainWindow.setProgressBar(-1)
  } catch (error) {
    job.logStream?.end()
    job.logStream = null
    job.process = null
    releasePowerSaveBlocker()
    jobs.delete(jobId)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    mainWindow.webContents.send('encoding-error', { jobId, error: msg })
    mainWindow.setProgressBar(1, { mode: 'error' })
  }
}

function pathHash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(16)
}
