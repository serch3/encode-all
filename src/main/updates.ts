import { app } from 'electron'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { UpdateState } from '../preload/api.types'
import { hasActiveEncodings } from './ffmpeg'

let state: UpdateState = { status: 'unavailable' }
let updater: typeof import('electron-updater').autoUpdater | undefined
let initialization: Promise<void> | undefined
let publish: (state: UpdateState) => void = () => {}

function update(next: UpdateState): UpdateState {
  state = next
  publish(next)
  return next
}

async function initialize(): Promise<void> {
  if (!initialization)
    initialization = (async () => {
      if (!app.isPackaged || !['darwin', 'win32'].includes(process.platform)) return
      const metadata = JSON.parse(
        await readFile(join(app.getAppPath(), 'package.json'), 'utf8')
      ) as { signedRelease?: boolean }
      if (!metadata.signedRelease) return
      updater = (await import('electron-updater')).autoUpdater
      updater.autoDownload = false
      updater.autoInstallOnAppQuit = false
      updater.allowDowngrade = false
      updater.on('update-available', (info) =>
        update({ status: 'available', version: info.version })
      )
      updater.on('update-not-available', () => update({ status: 'current' }))
      updater.on('download-progress', (progress) =>
        update({ status: 'downloading', progress: progress.percent })
      )
      updater.on('update-downloaded', (info) =>
        update({ status: 'downloaded', version: info.version })
      )
      updater.on('error', (error) => update({ status: 'error', message: error.message }))
      update({ status: 'idle' })
    })()
  await initialization
}

export function onUpdateState(callback: (state: UpdateState) => void): void {
  publish = callback
}
export async function getUpdateState(): Promise<UpdateState> {
  await initialize()
  return state
}

export async function checkForUpdates(channel: 'stable' | 'beta'): Promise<UpdateState> {
  await initialize()
  if (!updater) return state
  if (!['stable', 'beta'].includes(channel)) throw new Error('Invalid update channel.')
  if (['checking', 'downloading', 'downloaded'].includes(state.status)) return state
  updater.allowPrerelease = channel === 'beta'
  update({ status: 'checking' })
  try {
    await updater.checkForUpdates()
  } catch (error) {
    update({ status: 'error', message: error instanceof Error ? error.message : String(error) })
  }
  return state
}

export async function downloadUpdate(): Promise<UpdateState> {
  if (!updater || state.status !== 'available')
    throw new Error('Check for an available update first.')
  update({ status: 'downloading', progress: 0 })
  try {
    await updater.downloadUpdate()
  } catch (error) {
    update({ status: 'error', message: error instanceof Error ? error.message : String(error) })
  }
  return state
}

export async function installUpdate(prepareQuit: () => Promise<void>): Promise<void> {
  if (!updater || state.status !== 'downloaded') throw new Error('Download an update first.')
  if (hasActiveEncodings())
    throw new Error('Finish or stop active encodes before installing the update.')
  await prepareQuit()
  updater.quitAndInstall(false, true)
}
