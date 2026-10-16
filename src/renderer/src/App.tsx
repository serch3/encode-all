import HistoryPage from './components/pages/HistoryPage'
import QueueWorkspace from './components/encoding/QueueWorkspace'
import { Button, Card, CardBody, Input } from '@heroui/react'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { isHardwareEncoder } from '../../shared/encoders'
import { useEncodingConfig } from './hooks/useEncodingConfig'
import { useQueueManager } from './hooks/useQueueManager'
import { useEncodingSession } from './hooks/useEncodingSession'
import { useVideoPreview } from './hooks/useVideoPreview'
import { useBatchReview } from './hooks/useBatchReview'
import { editIcon as EditIcon, folderIcon as FolderIcon } from './components/shared/icons'
import { DropZone } from './components/shared'
import Layout from './components/layout'
import { SettingsPage, GeneralPage, AboutPage } from './components/pages'
import { FfmpegPreview, FfmpegSetup } from './components/ffmpeg'
import VideoPreview from './components/ffmpeg/VideoPreview'
import BatchReview from './components/encoding/BatchReview'
import {
  QueueDrawer,
  ProfileManager,
  EncodingSettings,
  FloatingProgress
} from './components/encoding'
import { outputFilename, previewEncodingOptions } from './utils/encodingOptions'
import type { EncodingProfile } from './types'

// Set to true to always show the FFmpeg setup modal during development
const FORCE_FFMPEG_MODAL = false
const FFMPEG_PATH_STORAGE_KEY = 'ffmpeg-path'

function readSavedFfmpegPath(): string | undefined {
  try {
    return localStorage.getItem(FFMPEG_PATH_STORAGE_KEY) || undefined
  } catch {
    return undefined
  }
}

function App(): React.JSX.Element {
  const [showFfmpegPreview, setShowFfmpegPreview] = useState<boolean>(false)
  const [active, setActive] = useState<'general' | 'preview' | 'settings' | 'about' | 'history'>(
    'general'
  )
  const [showFfmpegSetup, setShowFfmpegSetup] = useState<boolean>(false)
  const [ffmpegChecked, setFfmpegChecked] = useState<boolean>(false)
  const [supportedEncoders, setSupportedEncoders] = useState<string[] | undefined>()
  const [hasNvidiaGpu, setHasNvidiaGpu] = useState<boolean>(false)
  const [supportedNvidiaEncoders, setSupportedNvidiaEncoders] = useState<string[] | undefined>()
  const [isCheckingHardware, setIsCheckingHardware] = useState(true)
  const [ffmpegPath, setFfmpegPath] = useState<string | undefined>(readSavedFfmpegPath)
  const [showProgressPage, setShowProgressPage] = useState<boolean>(false)
  const [nativePaths, setNativePaths] = useState<string[]>([])
  const [importBusy, setImportBusy] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [outputError, setOutputError] = useState<string | null>(null)
  const [logError, setLogError] = useState<string | null>(null)

  const config = useEncodingConfig()
  const queue = useQueueManager(ffmpegPath)
  const session = useEncodingSession({
    queuedJobs: queue.queuedJobs,
    setQueuedJobs: queue.setQueuedJobs,
    selectedJobIds: queue.selectedJobIds,
    setSelectedJobIds: queue.setSelectedJobIds,
    maxConcurrency: queue.maxConcurrency,
    continueOnError: queue.continueOnError,
    ffmpegPath,
    config
  })
  const preview = useVideoPreview({
    jobs: queue.queuedJobs,
    config,
    ffmpegPath,
    ready: ffmpegChecked,
    checking: isCheckingHardware,
    isEncoding: session.isEncoding,
    supportedNvidiaEncoders
  })
  const previewBusy = preview.busy

  const handleEncoderSupportChange = useCallback((encoders: string[]): void => {
    setSupportedEncoders(encoders)
    const nvidia = encoders.filter((codec) => codec.includes('nvenc'))
    setSupportedNvidiaEncoders(nvidia)
    setHasNvidiaGpu(nvidia.length > 0)
  }, [])

  const handleFfmpegPathSelected = (path: string): void => {
    setFfmpegPath(path)
    try {
      localStorage.setItem(FFMPEG_PATH_STORAGE_KEY, path)
    } catch (error) {
      console.warn('Could not save FFmpeg path', error)
    }
  }

  // Only an actual installation check can enable encoding.
  useEffect(() => {
    let current = true
    setFfmpegChecked(false)
    setHasNvidiaGpu(false)
    setSupportedNvidiaEncoders(undefined)
    setSupportedEncoders(undefined)
    setIsCheckingHardware(true)
    void (async () => {
      try {
        let status = await window.api.checkFfmpeg(ffmpegPath)
        if (!status.isInstalled && ffmpegPath) status = await window.api.checkFfmpeg()
        if (!current) return
        setFfmpegChecked(status.isInstalled)
        if (status.isInstalled) {
          if (status.path && status.path !== ffmpegPath) handleFfmpegPathSelected(status.path)
          const all = await window.api.getSupportedEncoders(status.path ?? ffmpegPath)
          const supported = all.filter((codec) => codec.includes('nvenc'))
          if (current) {
            setSupportedNvidiaEncoders(supported)
            setSupportedEncoders(all)
            setHasNvidiaGpu(supported.length > 0)
          }
        } else {
          setShowFfmpegSetup(true)
        }
      } catch (error) {
        console.error('Failed to check FFmpeg:', error)
        if (current) setShowFfmpegSetup(true)
      } finally {
        if (current) setIsCheckingHardware(false)
      }
    })()
    return () => {
      current = false
    }
  }, [ffmpegPath])

  const handleFfmpegSetupClose = async (): Promise<void> => {
    const status = await window.api.checkFfmpeg(ffmpegPath)
    setFfmpegChecked(status.isInstalled)
    if (status.isInstalled) {
      if (status.path) handleFfmpegPathSelected(status.path)
      setShowFfmpegSetup(false)
    }
  }

  const handleFfmpegSetupSkip = (): void => {
    setShowFfmpegSetup(false)
    setFfmpegChecked(false)
  }

  const handleSelectFolder = async (): Promise<void> => {
    if (importBusy || session.isEncoding || previewBusy) return
    setImportBusy(true)
    try {
      setFileError(null)
      const folderPath = await window.api.selectFolder()
      if (folderPath) {
        const files = await window.api.readVideoFiles(folderPath)
        if (files.length === 0) {
          setFileError('No supported videos were found in this folder. Choose another folder.')
          return
        }
        queue.enqueueFiles(files)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to select folder'
      setFileError(errorMessage)
    } finally {
      setImportBusy(false)
    }
  }

  const handleSelectFiles = async (): Promise<void> => {
    if (importBusy || session.isEncoding || previewBusy) return
    setImportBusy(true)
    setFileError(null)
    try {
      const files = await window.api.selectVideoFiles()
      if (files.length) queue.enqueueFiles(files)
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Could not add videos.')
    } finally {
      setImportBusy(false)
    }
  }

  useEffect(
    () =>
      window.api.onNativeImport((paths) => setNativePaths((previous) => [...previous, ...paths])),
    []
  )
  useEffect(() => {
    if (!nativePaths.length || importBusy || session.isEncoding || previewBusy || queue.isRestoring)
      return
    setImportBusy(true)
    const paths = nativePaths
    setNativePaths([])
    void window.api
      .importPaths(paths)
      .then((files) => {
        if (files.length) queue.enqueueFiles(files)
        else setFileError('No supported videos were found in these files or folders.')
      })
      .catch((error) =>
        setFileError(error instanceof Error ? error.message : 'Could not add videos.')
      )
      .finally(() => setImportBusy(false))
    // Imports enqueue once; subsequent queue renders must not restart the scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativePaths, importBusy, session.isEncoding, previewBusy, queue.isRestoring])

  const handleWorkspaceDrop = (event: React.DragEvent): void => {
    if (!event.dataTransfer.files.length) return
    event.preventDefault()
    if (session.isEncoding || previewBusy || importBusy) return
    try {
      const paths = Array.from(event.dataTransfer.files)
        .map((file) => window.api.getPathForFile(file))
        .filter(Boolean)
      setNativePaths((previous) => [...previous, ...paths])
    } catch {
      setFileError('Could not read the dropped files. Use Add files or Add folder.')
    }
  }

  const handleSelectOutputDirectory = async (): Promise<void> => {
    try {
      setOutputError(null)
      const folderPath = await window.api.selectFolder()
      if (folderPath) config.setOutputDirectory(folderPath)
    } catch (error) {
      setOutputError(error instanceof Error ? error.message : 'Could not select an output folder.')
    }
  }

  const handleSelectLogFolder = async (): Promise<void> => {
    try {
      setLogError(null)
      const folderPath = await window.api.selectFolder()
      if (folderPath) config.setLogDirectory(folderPath)
    } catch (error) {
      setLogError(error instanceof Error ? error.message : 'Could not select a log folder.')
    }
  }

  const handleLoadProfile = (profile: EncodingProfile): void => {
    config.setPixelFormat(profile.pixelFormat ?? 'compatible')
    config.setTargetSizeMb(profile.targetSizeMb ?? 0)
    config.setMaxHeight(profile.maxHeight ?? 0)
    config.setContainer(profile.container)
    config.setVideoCodec(profile.videoCodec)
    config.setAudioCodec(profile.audioCodec)
    config.setAudioChannels(profile.audioChannels)
    config.setAudioBitrate(profile.audioBitrate)
    config.setVolumeDb(profile.volumeDb)
    config.setThreads(profile.threads)
    config.setTrackSelection(profile.trackSelection)
    config.setCrf(profile.crf)
    config.setPreset(profile.preset)
    config.setRenamePattern(profile.renamePattern)
    config.setVideoBitrate(profile.videoBitrate ?? 2500)
    config.setRateControlMode(profile.rateControlMode ?? 'crf')
    config.setTwoPass(profile.twoPass ?? false)
    config.setSubtitleMode(profile.subtitleMode ?? 'none')
  }

  const handleSaveProfile = (profile: EncodingProfile): void => {
    config.setSavedProfiles((prev) => [...prev, profile])
  }

  const handleDeleteProfile = (id: string): void => {
    config.setSavedProfiles((prev) => prev.filter((p) => p.id !== id))
  }

  const getPreviewFilename = (): string => {
    const job = selectedJobs[0]
    const settings = job ? previewEncodingOptions(job, config, ffmpegPath) : config
    return outputFilename(job?.file.name ?? 'example', settings, config.renamePattern)
  }

  const isNvenc = config.videoCodec.includes('nvenc')
  const selectedIds = useMemo(() => new Set(queue.selectedJobIds), [queue.selectedJobIds])
  const selectedJobs = useMemo(
    () => queue.queuedJobs.filter((job) => selectedIds.has(job.id)),
    [queue.queuedJobs, selectedIds]
  )
  const runnableJobs = selectedJobs.filter((job) =>
    ['pending', 'error', 'canceled'].includes(job.status)
  )
  const encoderReady =
    ffmpegChecked && (!isCheckingHardware || !isHardwareEncoder(config.videoCodec))
  const batchReview = useBatchReview(
    runnableJobs,
    queue.queuedJobs.map((job) => job.file.path),
    config,
    ffmpegPath,
    supportedNvidiaEncoders
  )
  const canStartBatch =
    encoderReady &&
    !previewBusy &&
    !session.isEncoding &&
    !importBusy &&
    !queue.isLoadingQueue &&
    !queue.isRestoring &&
    runnableJobs.length > 0
  const handleReviewBatch = (): void => {
    if (!canStartBatch) return
    queue.setIsQueueOpen(false)
    void batchReview.review()
  }
  const handleConfirmBatch = (): void => {
    if (!canStartBatch || !batchReview.canStart) return
    const paths = Object.fromEntries(
      batchReview.entries.map((entry) => [entry.jobId, entry.outputPath])
    )
    batchReview.close()
    setActive('general')
    setShowProgressPage(true)
    session.handleStartEncoding(
      paths,
      Object.fromEntries(batchReview.entries.map((entry) => [entry.jobId, entry.reviewToken])),
      Object.fromEntries(batchReview.entries.map((entry) => [entry.jobId, entry.encoding]))
    )
  }
  const startHint = session.isEncoding
    ? 'An encoding batch is running. View its progress from the queue.'
    : previewBusy
      ? 'Wait for the quality preview to finish, or cancel it in the Preview tab.'
      : importBusy || queue.isLoadingQueue
        ? 'Loading videos into your queue…'
        : isCheckingHardware
          ? 'Checking FFmpeg and available encoders…'
          : !ffmpegChecked
            ? 'Set up FFmpeg to enable encoding. You can add videos now.'
            : queue.queuedJobs.length === 0
              ? 'Add videos to start your first batch.'
              : selectedJobs.length === 0
                ? 'Select videos in the queue to encode them.'
                : runnableJobs.length === 0
                  ? 'The selected videos are already complete. Select pending files or add videos.'
                  : `${runnableJobs.length} video${runnableJobs.length === 1 ? '' : 's'} ready. Review outputs before starting.`

  return (
    <div
      className="contents"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault()
      }}
      onDrop={handleWorkspaceDrop}
    >
      <Layout
        title="Encode All"
        active={active}
        onSelect={setActive}
        onOpenQueue={() => queue.setIsQueueOpen(true)}
        queueStats={{ total: queue.queuedJobs.length, selected: selectedJobs.length }}
        isEncoding={session.isEncoding}
        isPreviewing={previewBusy}
        overallProgress={session.overallProgress}
      >
        <FloatingProgress
          isVisible={!showProgressPage || active !== 'general'}
          isEncoding={session.isEncoding}
          encodingError={session.encodingError}
          currentEncodingFile={session.currentEncodingFile}
          overallProgress={session.overallProgress}
          eta={session.eta}
          onPress={() => {
            setActive('general')
            setShowProgressPage(true)
          }}
          onClearError={() => session.setEncodingError(null)}
        />

        {active === 'general' && (
          <GeneralPage
            encoderContent={
              <div className="grid gap-4 grid-cols-1 min-[1100px]:grid-cols-[minmax(380px,1.2fr)_minmax(360px,1fr)] items-start">
                <div className="col-span-full">
                  <h1 className="text-2xl font-semibold tracking-tight">Encode videos</h1>
                  <p className="text-sm text-default-500">
                    Add videos, review your settings, then encode the selected files.
                  </p>
                </div>
                <div className="flex flex-col gap-3 min-w-0">
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      color="primary"
                      onPress={() => void handleSelectFiles()}
                      isDisabled={
                        session.isEncoding || previewBusy || importBusy || queue.isRestoring
                      }
                    >
                      Add files
                    </Button>
                    <Button
                      variant="flat"
                      onPress={() => void handleSelectFolder()}
                      isDisabled={
                        session.isEncoding || previewBusy || importBusy || queue.isRestoring
                      }
                    >
                      Add folder
                    </Button>
                    <Button
                      variant="light"
                      onPress={() => void queue.handleLoadQueue()}
                      isDisabled={session.isEncoding || previewBusy || queue.isLoadingQueue}
                    >
                      Load queue
                    </Button>
                  </div>
                  {queue.queuedJobs.length === 0 && (
                    <DropZone
                      isEncoding={session.isEncoding || previewBusy}
                      isLoading={importBusy || queue.isLoadingQueue}
                      queueCount={queue.queuedJobs.length}
                      onFilesDropped={queue.enqueueFiles}
                      onBrowseFolder={handleSelectFolder}
                      onLoadSession={queue.handleLoadQueue}
                    />
                  )}
                  {queue.queuedJobs.length > 0 && (
                    <QueueWorkspace
                      jobs={queue.queuedJobs}
                      selectedIds={queue.selectedJobIds}
                      locked={session.isEncoding || previewBusy || importBusy || queue.isRestoring}
                      onSelect={queue.handleFileSelect}
                      onSelectAll={() => queue.handleSelectAll()}
                      onManage={() => queue.setIsQueueOpen(true)}
                      onPreview={(id) => {
                        preview.setSelectedId(id)
                        setActive('preview')
                      }}
                      onRetryMetadata={queue.retryMediaInfo}
                    />
                  )}

                  <Button variant="flat" color="primary" onPress={() => queue.setIsQueueOpen(true)}>
                    {queue.queuedJobs.length > 0
                      ? `Review queue · ${selectedJobs.length} of ${queue.queuedJobs.length} selected`
                      : 'Open video queue'}
                  </Button>
                  <Button variant="flat" onPress={() => setActive('preview')}>
                    Open quality preview
                  </Button>
                  {fileError && (
                    <p role="alert" className="text-sm text-danger">
                      {fileError}
                    </p>
                  )}
                  {queue.queueFeedback && !queue.isQueueOpen && (
                    <p
                      role={queue.queueFeedback.isError ? 'alert' : 'status'}
                      className="text-sm text-default-600"
                    >
                      {queue.queueFeedback.message}
                    </p>
                  )}
                </div>
                <Card className="min-w-0 overflow-visible">
                  <CardBody className="flex flex-col gap-4 p-0 overflow-visible">
                    <div className="p-4 flex flex-col gap-4">
                      <ProfileManager
                        isDisabled={session.isEncoding || previewBusy}
                        currentSettings={{
                          targetSizeMb: config.targetSizeMb,
                          pixelFormat: config.pixelFormat,
                          maxHeight: config.maxHeight,
                          container: config.container,
                          videoCodec: config.videoCodec,
                          audioCodec: config.audioCodec,
                          audioChannels: config.audioChannels,
                          audioBitrate: config.audioBitrate,
                          volumeDb: config.volumeDb,
                          threads: config.threads,
                          trackSelection: config.trackSelection,
                          crf: config.crf,
                          preset: config.preset,
                          renamePattern: config.renamePattern,
                          videoBitrate: config.videoBitrate,
                          rateControlMode: config.rateControlMode,
                          twoPass: config.twoPass,
                          subtitleMode: config.subtitleMode
                        }}
                        profiles={config.savedProfiles}
                        onLoadProfile={handleLoadProfile}
                        onSaveProfile={handleSaveProfile}
                        onDeleteProfile={handleDeleteProfile}
                      />
                      <EncodingSettings
                        targetSizeMb={config.targetSizeMb}
                        setTargetSizeMb={config.setTargetSizeMb}
                        pixelFormat={config.pixelFormat}
                        setPixelFormat={config.setPixelFormat}
                        maxHeight={config.maxHeight}
                        setMaxHeight={config.setMaxHeight}
                        container={config.container}
                        setContainer={config.setContainer}
                        videoCodec={config.videoCodec}
                        setVideoCodec={config.setVideoCodec}
                        audioCodec={config.audioCodec}
                        setAudioCodec={config.setAudioCodec}
                        audioChannels={config.audioChannels}
                        setAudioChannels={config.setAudioChannels}
                        audioBitrate={config.audioBitrate}
                        setAudioBitrate={config.setAudioBitrate}
                        volumeDb={config.volumeDb}
                        setVolumeDb={config.setVolumeDb}
                        crf={config.crf}
                        setCrf={config.setCrf}
                        preset={config.preset}
                        setPreset={config.setPreset}
                        threads={config.threads}
                        setThreads={config.setThreads}
                        trackSelection={config.trackSelection}
                        setTrackSelection={config.setTrackSelection}
                        videoBitrate={config.videoBitrate}
                        setVideoBitrate={config.setVideoBitrate}
                        rateControlMode={config.rateControlMode}
                        setRateControlMode={config.setRateControlMode}
                        twoPass={config.twoPass}
                        setTwoPass={config.setTwoPass}
                        subtitleMode={config.subtitleMode}
                        setSubtitleMode={config.setSubtitleMode}
                        isEncoding={session.isEncoding || previewBusy}
                        hasNvidiaGpu={hasNvidiaGpu}
                        supportedEncoders={supportedEncoders}
                        supportedNvidiaEncoders={supportedNvidiaEncoders}
                        isCheckingHardware={isCheckingHardware}
                        isNvenc={isNvenc}
                      />
                    </div>

                    <div className="border-t border-divider p-4 flex flex-col gap-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2 items-end">
                          <Input
                            label="Output directory"
                            startContent={<FolderIcon className="w-5 h-5 text-default-400" />}
                            placeholder="Same as input (default)"
                            readOnly
                            value={config.outputDirectory}
                            className="flex-1"
                            isDisabled={session.isEncoding || previewBusy}
                          />
                          <Button
                            aria-label="Browse for an output folder"
                            variant="flat"
                            onPress={handleSelectOutputDirectory}
                            className="h-14"
                            isDisabled={session.isEncoding || previewBusy}
                          >
                            Browse
                          </Button>
                        </div>
                        {config.outputDirectory && (
                          <Button
                            size="sm"
                            variant="light"
                            className="self-start"
                            onPress={() => config.setOutputDirectory('')}
                            isDisabled={session.isEncoding || previewBusy}
                          >
                            Use input folders instead
                          </Button>
                        )}
                        <p className="text-xs text-default-500">
                          {config.outputDirectory
                            ? 'All encoded files will be saved in the chosen output folder.'
                            : 'Encoded files will be saved beside each source video.'}
                        </p>
                        {outputError && (
                          <p role="alert" className="text-sm text-danger">
                            {outputError}
                          </p>
                        )}
                        <Input
                          label="Rename pattern"
                          startContent={<EditIcon className="w-5 h-5 text-default-400" />}
                          placeholder="e.g. {name}_{codec}"
                          value={config.renamePattern}
                          onChange={(e) => config.setRenamePattern(e.target.value)}
                          description="Tokens: {name} {codec} {ext}"
                          isDisabled={session.isEncoding || previewBusy}
                        />
                        <div className="text-xs text-default-600 break-all select-text">
                          {selectedJobs.length > 0 ? 'First output' : 'Example output'}:{' '}
                          {getPreviewFilename()}
                        </div>
                      </div>
                    </div>
                  </CardBody>
                </Card>
                {showFfmpegPreview && (
                  <div className="col-span-full min-w-0">
                    <FfmpegPreview
                      job={selectedJobs[0]}
                      config={config}
                      encodingError={session.encodingError}
                      onClearError={() => session.setEncodingError(null)}
                      ffmpegPath={ffmpegPath}
                    />
                  </div>
                )}
                <div className="col-span-full sticky bottom-0 z-20 bg-content1 border border-divider rounded-xl p-3 shadow-lg flex flex-wrap items-center gap-3">
                  <p
                    id="encoding-start-hint"
                    role="status"
                    className="flex-1 min-w-48 text-sm text-default-600"
                  >
                    {startHint}
                  </p>
                  {!ffmpegChecked && !isCheckingHardware && (
                    <Button variant="flat" color="warning" onPress={() => setShowFfmpegSetup(true)}>
                      Set up FFmpeg
                    </Button>
                  )}
                  <Button
                    color="primary"
                    aria-describedby="encoding-start-hint"
                    className="min-w-44 h-11 font-semibold"
                    isDisabled={!canStartBatch}
                    onPress={handleReviewBatch}
                  >
                    {session.isEncoding
                      ? 'Encoding in progress…'
                      : runnableJobs.length > 0
                        ? `Encode ${runnableJobs.length} file${runnableJobs.length === 1 ? '' : 's'}`
                        : 'Start Encoding'}
                  </Button>
                </div>
              </div>
            }
            logs={session.encodingLogs}
            onCancel={session.handleCancelEncoding}
            onPause={session.handlePauseEncoding}
            isPaused={session.isPaused}
            isEncoding={session.isEncoding}
            encodingProgress={session.encodingProgress}
            currentEncodingFile={session.currentEncodingFile}
            encodingError={session.encodingError}
            onClearError={() => session.setEncodingError(null)}
            eta={session.eta}
            overallProgress={session.overallProgress}
            activeJobs={selectedJobs}
            showProgressPage={showProgressPage}
            onDismissProgress={() => setShowProgressPage(false)}
            encodingSummary={session.encodingSummary}
            onDismissSummary={() => {
              session.setEncodingSummary(null)
              setShowProgressPage(false)
            }}
            onOpenHistory={() => setActive('history')}
            onReviewFailed={() => {
              session.setEncodingSummary(null)
              setShowProgressPage(false)
              queue.setIsQueueOpen(true)
            }}
          />
        )}
        {active === 'preview' && (
          <VideoPreview
            preview={preview}
            onAdjustSettings={() => setActive('general')}
            onOpenQueue={() => queue.setIsQueueOpen(true)}
            onSetupFfmpeg={() => setShowFfmpegSetup(true)}
          />
        )}
        {active === 'settings' && (
          <SettingsPage
            isEncoding={session.isEncoding || previewBusy}
            supportedEncoders={supportedEncoders}
            onEncoderSupportChange={handleEncoderSupportChange}
            showFfmpegPreview={showFfmpegPreview}
            onShowFfmpegPreviewChange={setShowFfmpegPreview}
            hasNvidiaGpu={hasNvidiaGpu}
            enableLogging={config.enableLogging}
            onEnableLoggingChange={config.setEnableLogging}
            logDirectory={config.logDirectory}
            onSelectLogDirectory={handleSelectLogFolder}
            logError={logError}
            ffmpegPath={ffmpegPath}
            onFfmpegPathSelected={handleFfmpegPathSelected}
            onOpenFfmpegSetup={() => setShowFfmpegSetup(true)}
          />
        )}
        {active === 'history' && <HistoryPage />}
        {active === 'about' && <AboutPage />}
      </Layout>

      <QueueDrawer
        continueOnError={queue.continueOnError}
        onContinueOnErrorChange={queue.setContinueOnError}
        supportedEncoders={supportedEncoders}
        isOpen={queue.isQueueOpen}
        onClose={() => queue.setIsQueueOpen(false)}
        jobs={queue.queuedJobs}
        onSelectJob={queue.handleFileSelect}
        selectedJobIds={queue.selectedJobIds}
        hasNvidiaGpu={hasNvidiaGpu}
        supportedNvidiaEncoders={supportedNvidiaEncoders}
        onSelectAll={queue.handleSelectAll}
        onClearSelection={queue.handleClearSelection}
        onRemoveJobs={queue.handleRemoveJobs}
        onEncode={handleReviewBatch}
        isEncoding={session.isEncoding}
        isLocked={previewBusy || importBusy || queue.isLoadingQueue}
        lockReason={
          importBusy || queue.isLoadingQueue ? 'Loading videos into your queue…' : undefined
        }
        removedCount={queue.removedCount}
        onUndoRemove={queue.handleUndoRemove}
        canEncode={canStartBatch}
        encodeDisabledReason={!encoderReady || previewBusy ? startHint : undefined}
        queueFeedback={queue.queueFeedback}
        onSkipCurrent={session.handleSkipCurrent}
        onSaveQueue={queue.handleSaveQueue}
        onLoadQueue={queue.handleLoadQueue}
        overallProgress={session.overallProgress}
        eta={session.eta}
        maxConcurrency={queue.maxConcurrency}
        setMaxConcurrency={queue.setMaxConcurrency}
        maxRetries={queue.maxRetries}
        setMaxRetries={queue.setMaxRetries}
        onUpdateJobOverrides={queue.handleUpdateJobOverrides}
      />

      <BatchReview
        review={batchReview}
        canEncode={canStartBatch}
        onStart={handleConfirmBatch}
        onReviewQueue={() => {
          batchReview.close()
          queue.setIsQueueOpen(true)
        }}
      />

      <FfmpegSetup
        isOpen={FORCE_FFMPEG_MODAL || showFfmpegSetup}
        onClose={handleFfmpegSetupClose}
        onSkip={handleFfmpegSetupSkip}
        ffmpegPath={ffmpegPath}
        onPathSelected={handleFfmpegPathSelected}
      />
    </div>
  )
}

export default App
