import { EventEmitter } from 'events'
import { getUpdateState, checkForUpdates, downloadUpdate, installUpdate } from '../updates'
import { hasActiveEncodings } from '../ffmpeg'

const updater = Object.assign(new EventEmitter(), {
  checkForUpdates: jest.fn(),
  downloadUpdate: jest.fn(),
  quitAndInstall: jest.fn(),
  autoDownload: true,
  autoInstallOnAppQuit: true,
  allowDowngrade: true,
  allowPrerelease: false
})
jest.mock('electron', () => ({ app: { isPackaged: true, getAppPath: () => '/app' } }))
jest.mock('fs/promises', () => ({ readFile: async () => JSON.stringify({ signedRelease: true }) }))
jest.mock('electron-updater', () => ({ autoUpdater: updater }))
jest.mock('../ffmpeg', () => ({ hasActiveEncodings: jest.fn(() => false) }))

test('updates are explicit and installation waits for an idle app and saved state', async () => {
  const platform = process.platform
  Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
  try {
    await expect(getUpdateState()).resolves.toEqual({ status: 'idle' })
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    await checkForUpdates('beta')
    expect(updater.allowPrerelease).toBe(true)
    updater.emit('update-available', { version: '1.0.0' })
    updater.downloadUpdate.mockImplementation(async () =>
      updater.emit('update-downloaded', { version: '1.0.0' })
    )
    await expect(downloadUpdate()).resolves.toEqual({ status: 'downloaded', version: '1.0.0' })
    ;(hasActiveEncodings as jest.Mock).mockReturnValue(true)
    const save = jest.fn().mockResolvedValue(undefined)
    await expect(installUpdate(save)).rejects.toThrow('active encodes')
    expect(save).not.toHaveBeenCalled()
    ;(hasActiveEncodings as jest.Mock).mockReturnValue(false)
    await installUpdate(save)
    expect(save).toHaveBeenCalledTimes(1)
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
  } finally {
    Object.defineProperty(process, 'platform', { configurable: true, value: platform })
  }
})
