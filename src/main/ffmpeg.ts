import { spawn, ChildProcess } from 'child_process'
import { BrowserWindow, powerSaveBlocker } from 'electron'
import { createWriteStream, WriteStream, mkdirSync, existsSync } from 'fs'
import { join, basename, dirname } from 'path'
import { EncodingOptions } from '../preload/api.types'

let ffmpegProcess: ChildProcess | null = null
let logStream: WriteStream | null = null
let powerSaveBlockerId: number | null = null

export function cancelEncoding(): void {
  if (ffmpegProcess) {
    ffmpegProcess.kill()
    ffmpegProcess = null
  }
  if (logStream) {
    logStream.end()
    logStream = null
  }
  if (powerSaveBlockerId !== null) {
    powerSaveBlocker.stop(powerSaveBlockerId)
    powerSaveBlockerId = null
  }
}

// Helper to run ffmpeg command as promise
function runFfmpegCommand(
  executable: string,
  args: string[],
  mainWindow: BrowserWindow,
  onProgress: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpegProcess = spawn(executable, args)
    let duration = 0

    ffmpegProcess.stderr?.on('data', (data) => {
      const str = data.toString()
      logStream?.write(str)
      mainWindow.webContents.send('encoding-log', str)

      // Parse duration
      if (!duration) {
        const durationMatch = str.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/)
        if (durationMatch) {
          const hours = parseFloat(durationMatch[1])
          const minutes = parseFloat(durationMatch[2])
          const seconds = parseFloat(durationMatch[3])
          duration = hours * 3600 + minutes * 60 + seconds
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

    ffmpegProcess.on('close', (code) => {
      // Don't set ffmpegProcess to null here if we might run another pass
      // But we must resolve/reject
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`))
      }
    })

    ffmpegProcess.on('error', (err) => {
      reject(err)
    })
  })
}

export async function startEncoding(
  options: EncodingOptions,
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
    rateControlMode
  } = options

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
  logStream = createWriteStream(logPath)

  // Prevent system sleep during encoding
  if (powerSaveBlockerId === null) {
    powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension')
  }

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

      await runFfmpegCommand(executable, pass1Args, mainWindow, (p) => {
        mainWindow.webContents.send('encoding-progress', p / 2)
        mainWindow.setProgressBar(p / 200)
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

      await runFfmpegCommand(executable, pass2Args, mainWindow, (p) => {
        const total = 50 + p / 2
        mainWindow.webContents.send('encoding-progress', total)
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

      await runFfmpegCommand(executable, args, mainWindow, (p) => {
        mainWindow.webContents.send('encoding-progress', p)
        mainWindow.setProgressBar(p / 100)
      })
    }

    // Success
    logStream?.end()
    logStream = null
    ffmpegProcess = null
    if (powerSaveBlockerId !== null) {
      powerSaveBlocker.stop(powerSaveBlockerId)
      powerSaveBlockerId = null
    }
    mainWindow.webContents.send('encoding-complete')
    mainWindow.setProgressBar(-1)
  } catch (error) {
    logStream?.end()
    logStream = null
    ffmpegProcess = null
    if (powerSaveBlockerId !== null) {
      powerSaveBlocker.stop(powerSaveBlockerId)
      powerSaveBlockerId = null
    }
    const msg = error instanceof Error ? error.message : 'Unknown error'
    mainWindow.webContents.send('encoding-error', msg)
    mainWindow.setProgressBar(1, { mode: 'error' })
  }
}

function pathHash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(16)
}
