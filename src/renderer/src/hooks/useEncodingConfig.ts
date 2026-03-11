import { useLocalStorage } from './useLocalStorage'
import type { EncodingProfile } from '../types'

/**
 * Centralises all persistent encoding-configuration state.
 * Every value is synced to localStorage so settings survive restarts.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useEncodingConfig() {
  const [container, setContainer] = useLocalStorage<string>('config-container', 'mkv')
  const [videoCodec, setVideoCodec] = useLocalStorage<string>('config-videoCodec', 'libx265')
  const [audioCodec, setAudioCodec] = useLocalStorage<string>('config-audioCodec', 'aac')
  const [audioChannels, setAudioChannels] = useLocalStorage<string>('config-audioChannels', 'same')
  const [audioBitrate, setAudioBitrate] = useLocalStorage<number>('config-audioBitrate', 128)
  const [volumeDb, setVolumeDb] = useLocalStorage<number>('config-volumeDb', 0)
  const [renamePattern, setRenamePattern] = useLocalStorage<string>(
    'config-renamePattern',
    '{name}_{codec}'
  )
  const [outputDirectory, setOutputDirectory] = useLocalStorage<string>(
    'config-outputDirectory',
    ''
  )
  const [threads, setThreads] = useLocalStorage<number>('config-threads', 0)
  const [trackSelection, setTrackSelection] = useLocalStorage<string>(
    'config-trackSelection',
    'auto'
  )
  const [crf, setCrf] = useLocalStorage<number>('config-crf', 23)
  const [preset, setPreset] = useLocalStorage<string>('config-preset', 'medium')
  const [twoPass, setTwoPass] = useLocalStorage<boolean>('config-twoPass', false)
  const [subtitleMode, setSubtitleMode] = useLocalStorage<string>('config-subtitleMode', 'none')
  const [videoBitrate, setVideoBitrate] = useLocalStorage<number>('config-videoBitrate', 2500)
  const [rateControlMode, setRateControlMode] = useLocalStorage<'crf' | 'bitrate'>(
    'config-rateControlMode',
    'crf'
  )
  const [logDirectory, setLogDirectory] = useLocalStorage<string>('logDirectory', '')
  const [savedProfiles, setSavedProfiles] = useLocalStorage<EncodingProfile[]>('saved-profiles', [])

  return {
    container,
    setContainer,
    videoCodec,
    setVideoCodec,
    audioCodec,
    setAudioCodec,
    audioChannels,
    setAudioChannels,
    audioBitrate,
    setAudioBitrate,
    volumeDb,
    setVolumeDb,
    renamePattern,
    setRenamePattern,
    outputDirectory,
    setOutputDirectory,
    threads,
    setThreads,
    trackSelection,
    setTrackSelection,
    crf,
    setCrf,
    preset,
    setPreset,
    twoPass,
    setTwoPass,
    subtitleMode,
    setSubtitleMode,
    videoBitrate,
    setVideoBitrate,
    rateControlMode,
    setRateControlMode,
    logDirectory,
    setLogDirectory,
    savedProfiles,
    setSavedProfiles
  }
}

export type EncodingConfig = ReturnType<typeof useEncodingConfig>
