import { app, BrowserWindow, net } from 'electron'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const directory = mkdtempSync(join(tmpdir(), 'encode-all-app-check-'))
const userData = join(directory, 'app-data')
mkdirSync(userData)
app.setPath('userData', userData)
// Keep this test window hidden and separate from the user's app data.
BrowserWindow.prototype.show = () => {}
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg'
const inputPath = join(directory, 'sample 日本語 & clip.mkv')
const fixture = spawnSync(
  ffmpeg,
  ['-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=10', '-t', '3', '-c:v', 'ffv1', inputPath],
  { encoding: 'utf8', windowsHide: true }
)
if (fixture.status !== 0) throw new Error(fixture.error?.message || fixture.stderr)

createRequire(import.meta.url)('../out/main/index.js')
const timeout = setTimeout(() => {
  console.error('Windows app smoke check timed out')
  app.exit(1)
}, 45_000)

app.whenReady().then(async () => {
  let exitCode = 0
  try {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) throw new Error('App window was not created')
    if (window.webContents.isLoading()) {
      await new Promise((resolve, reject) => {
        window.webContents.once('did-finish-load', resolve)
        window.webContents.once('did-fail-load', (_, code, description) =>
          reject(new Error(`${code}: ${description}`))
        )
      })
    }
    const options = {
      encoding: {
        inputPath,
        outputPath: '',
        container: 'mp4',
        videoCodec: 'libx264',
        audioCodec: 'aac',
        audioChannels: 'same',
        audioBitrate: 128,
        volumeDb: 0,
        crf: 23,
        preset: 'ultrafast',
        threads: 2,
        trackSelection: 'auto',
        ffmpegPath: ffmpeg,
        enableLogging: false,
        twoPass: false,
        subtitleMode: 'none',
        videoBitrate: 1000,
        rateControlMode: 'crf'
      },
      startSeconds: 0,
      durationSeconds: 2
    }
    const preview = await window.webContents.executeJavaScript(
      `window.api.createPreview(${JSON.stringify(options)})`
    )
    const response = await net.fetch(preview.url, { headers: { Range: 'bytes=0-127' } })
    const bytes = await response.arrayBuffer()
    if (response.status !== 206 || bytes.byteLength !== 128)
      throw new Error('Preview byte-range streaming failed')
    const playback = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'auto'
      video.muted = true
      video.src = ${JSON.stringify(preview.url)}
      video.onloadeddata = async () => {
        video.onloadeddata = null
        try {
          await video.play()
          await new Promise((done) => setTimeout(done, 500))
          if (video.currentTime <= 0) throw new Error('Preview playback clock did not advance')
          video.pause()
          const sought = new Promise((done) => { video.onseeked = done })
          video.currentTime = 1
          await sought
          const result = { duration: video.duration, width: video.videoWidth, seekTime: video.currentTime }
          video.removeAttribute('src'); video.load(); video.remove()
          resolve(result)
        } catch (error) { reject(error) }
      }
      video.onerror = () => reject(new Error('Preview playback failed: ' + video.error.message))
      document.body.append(video)
    })`)
    if (
      playback.width !== 160 ||
      Math.abs(playback.duration - 2) > 0.1 ||
      Math.abs(playback.seekTime - 1) > 0.1
    )
      throw new Error('Preview media metadata is incorrect')
    await window.webContents.executeJavaScript(
      `window.api.releasePreview(${JSON.stringify(preview.id)})`
    )
    const released = await net.fetch(preview.url)
    if (released.status !== 404) throw new Error('Released preview is still accessible')
    const cancellation = await window.webContents.executeJavaScript(`(async () => {
      const work = window.api.createPreview(${JSON.stringify(options)})
      const result = work.then(() => 'completed', (error) => error.message)
      await window.api.cancelPreview()
      return result
    })()`)
    if (!cancellation.includes('Preview canceled'))
      throw new Error(`Preview cancellation failed: ${cancellation}`)
    console.log(
      'Windows app: preview generation, range streaming, playback, cleanup, and cancellation verified'
    )
  } catch (error) {
    console.error(error)
    exitCode = 1
  } finally {
    clearTimeout(timeout)
    // Electron may still hold its user-data files open; the OS temp folder owns leftovers.
    try {
      rmSync(directory, { recursive: true, force: true })
    } catch {
      /* Leave isolated test data for OS cleanup. */
    }
    app.exit(exitCode)
  }
})
