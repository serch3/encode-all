import { spawn, ChildProcess } from 'child_process'
import { BrowserWindow } from 'electron'
import { createWriteStream, WriteStream, mkdirSync, existsSync } from 'fs'
import { join, basename, dirname } from 'path'
import { EncodingOptions } from '../preload/api.types'

let ffmpegProcess: ChildProcess | null = null
let logStream: WriteStream | null = null

export function cancelEncoding(): void {
  if (ffmpegProcess) {
    ffmpegProcess.kill()
    ffmpegProcess = null
  }
  if (logStream) {
    logStream.end()
    logStream = null
  }
}

export function startEncoding(options: EncodingOptions, mainWindow: BrowserWindow): void {
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
    jobTimestamp
  } = options

  // Construct arguments
  const args = ['-y', '-i', inputPath]

  // Video
  args.push('-c:v', videoCodec)
  if (videoCodec !== 'copy') {
    if (videoCodec.includes('nvenc')) {
      args.push('-cq', crf.toString())
    } else {
      args.push('-crf', crf.toString())
    }
    args.push('-preset', preset)
  }

  // Audio
  args.push('-c:a', audioCodec)
  if (audioCodec !== 'copy') {
    if (audioBitrate > 0) {
      args.push('-b:a', `${audioBitrate}k`)
    }
    if (audioChannels !== 'same') {
      if (audioChannels === 'mono') args.push('-ac', '1')
      if (audioChannels === 'stereo') args.push('-ac', '2')
      if (audioChannels === '5.1') args.push('-ac', '6')
    }
    if (volumeDb !== 0) {
      args.push('-filter:a', `volume=${volumeDb}dB`)
    }
  }

  // Threads
  if (threads > 0) {
    args.push('-threads', threads.toString())
  }

  // Track Selection
  if (trackSelection === 'all') {
    args.push('-map', '0')
  } else if (trackSelection === 'all_audio') {
    args.push('-map', '0:v:0', '-map', '0:a')
  } else {
    // Auto - usually default behavior of ffmpeg is fine
  }

  args.push(outputPath)

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

  // Spawn
  // Use provided ffmpeg path or default to 'ffmpeg' (assumed in PATH)
  const executable = ffmpegPath || 'ffmpeg'
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
      mainWindow.webContents.send('encoding-progress', progress)
    }
  })

  ffmpegProcess.on('close', (code) => {
    logStream?.end()
    logStream = null
    ffmpegProcess = null
    if (code === 0) {
      mainWindow.webContents.send('encoding-complete')
    } else {
      mainWindow.webContents.send('encoding-error', `FFmpeg exited with code ${code}`)
    }
  })

  ffmpegProcess.on('error', (err) => {
    logStream?.end()
    logStream = null
    ffmpegProcess = null
    mainWindow.webContents.send('encoding-error', err.message)
  })
}
