import { Button, Card, CardBody, Input } from '@heroui/react'
import { useState, useEffect } from 'react'
import { useEncodingConfig } from './hooks/useEncodingConfig'
import { useQueueManager } from './hooks/useQueueManager'
import { useEncodingSession } from './hooks/useEncodingSession'
import { editIcon as EditIcon, folderIcon as FolderIcon } from './components/shared/icons'
import { DropZone } from './components/shared'
import Layout from './components/layout'
import { SettingsPage, GeneralPage, AboutPage } from './components/pages'
import { FfmpegPreview, FfmpegSetup } from './components/ffmpeg'
import { QueueDrawer, ProfileManager, EncodingSettings } from './components/encoding'
import { buildFilenameFromPattern } from './utils/pattern'
import type { PatternTokens, EncodingProfile } from './types'

// Set to true to always show the FFmpeg setup modal during development
const FORCE_FFMPEG_MODAL = false

function App(): React.JSX.Element {
  const [showFfmpegPreview, setShowFfmpegPreview] = useState<boolean>(false)
  const [active, setActive] = useState<'general' | 'settings' | 'about'>('general')
  const [showFfmpegSetup, setShowFfmpegSetup] = useState<boolean>(false)
  const [ffmpegChecked, setFfmpegChecked] = useState<boolean>(false)
  const [hasNvidiaGpu, setHasNvidiaGpu] = useState<boolean>(false)
  const [ffmpegPath, setFfmpegPath] = useState<string | undefined>(undefined)

  const config = useEncodingConfig()
  const queue = useQueueManager(ffmpegPath)
  const session = useEncodingSession({
    queuedJobs: queue.queuedJobs,
    setQueuedJobs: queue.setQueuedJobs,
    selectedJobIds: queue.selectedJobIds,
    maxConcurrency: queue.maxConcurrency,
    ffmpegPath,
    config
  })

  // Check FFmpeg installation on startup
  useEffect(() => {
    const checkFFmpeg = async (): Promise<void> => {
      const hasBeenChecked = localStorage.getItem('ffmpeg-checked')

      // Always check for NVIDIA support if FFmpeg is checked or we are about to check it
      const checkNvidia = async (): Promise<void> => {
        try {
          const nvidiaSupported = await window.api?.checkNvidiaSupport()
          if (nvidiaSupported) {
            setHasNvidiaGpu(true)
          }
        } catch (e) {
          console.error('Failed to check NVIDIA support', e)
        }
      }

      try {
        const status = await window.api?.checkFfmpeg()
        if (status?.path) {
          setFfmpegPath(status.path)
        }

        if (!status?.isInstalled) {
          if (!hasBeenChecked) setShowFfmpegSetup(true)
        } else {
          setFfmpegChecked(true)
          if (!hasBeenChecked) localStorage.setItem('ffmpeg-checked', 'true')
          void checkNvidia()
        }
      } catch (error) {
        // Log error and show setup modal as fallback
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        console.error('Failed to check FFmpeg:', errorMessage)
        if (!hasBeenChecked) setShowFfmpegSetup(true)
      }
    }

    void checkFFmpeg()
  }, [])

  // Handlers for FFmpeg setup modal
  const handleFfmpegSetupClose = (): void => {
    setShowFfmpegSetup(false)
    setFfmpegChecked(true)
    localStorage.setItem('ffmpeg-checked', 'true')
  }

  const handleFfmpegSetupSkip = (): void => {
    setShowFfmpegSetup(false)
    setFfmpegChecked(true)
  }

  const handleSelectFolder = async (): Promise<void> => {
    try {
      const folderPath = await window.api.selectFolder()
      if (folderPath) {
        const files = await window.api.readVideoFiles(folderPath)
        queue.enqueueFiles(files)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to select folder'
      console.error('Error selecting folder:', errorMessage)
    }
  }

  const handleSelectOutputDirectory = async (): Promise<void> => {
    try {
      const folderPath = await window.api.selectFolder()
      if (folderPath) config.setOutputDirectory(folderPath)
    } catch (error) {
      console.error('Error selecting output directory:', error)
    }
  }

  const handleSelectLogFolder = async (): Promise<void> => {
    try {
      const folderPath = await window.api.selectFolder()
      if (folderPath) config.setLogDirectory(folderPath)
    } catch (error) {
      console.error('Failed to select log folder:', error)
    }
  }

  const handleLoadProfile = (profile: EncodingProfile): void => {
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
    const tokens: PatternTokens = {
      name: 'example',
      codec: config.videoCodec.replace('lib', ''),
      ext: config.container
    }
    return buildFilenameFromPattern(config.renamePattern, tokens)
  }

  const isNvenc = config.videoCodec.includes('nvenc')
  const selectedJobs = queue.queuedJobs.filter((job) => queue.selectedJobIds.includes(job.id))

  return (
    <>
      <Layout
        title="Encode All"
        active={active}
        onSelect={setActive}
        onOpenQueue={() => queue.setIsQueueOpen(true)}
        queueStats={{ total: queue.queuedJobs.length, selected: selectedJobs.length }}
      >
        {active === 'general' && (
          <GeneralPage
            encoderContent={
              <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
                <DropZone
                  isEncoding={session.isEncoding}
                  queueCount={queue.queuedJobs.length}
                  onFilesDropped={queue.enqueueFiles}
                  onBrowseFolder={handleSelectFolder}
                  onLoadSession={queue.handleLoadQueue}
                />
                <Card>
                  <CardBody className="flex flex-col gap-4">
                    <ProfileManager
                      currentSettings={{
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
                      isEncoding={session.isEncoding}
                      hasNvidiaGpu={hasNvidiaGpu}
                      isNvenc={isNvenc}
                    />

                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2 items-end">
                        <Input
                          label="Output directory"
                          startContent={<FolderIcon className="w-5 h-5 text-default-400" />}
                          placeholder="Same as input (default)"
                          readOnly
                          value={config.outputDirectory}
                          className="flex-1"
                          isDisabled={session.isEncoding}
                        />
                        <Button
                          variant="flat"
                          onPress={handleSelectOutputDirectory}
                          className="h-14"
                          isDisabled={session.isEncoding}
                        >
                          Browse
                        </Button>
                      </div>
                      <Input
                        label="Rename pattern"
                        startContent={<EditIcon className="w-5 h-5 text-default-400" />}
                        placeholder="e.g. {name}_{codec}"
                        value={config.renamePattern}
                        onChange={(e) => config.setRenamePattern(e.target.value)}
                        description="Tokens: {name} {codec} {ext}"
                        isDisabled={session.isEncoding}
                      />
                      <div className="text-xs text-foreground/60">
                        Preview: {getPreviewFilename()}
                      </div>
                    </div>
                    <Button
                      color="primary"
                      isDisabled={!ffmpegChecked || selectedJobs.length === 0 || session.isEncoding}
                      onPress={session.handleStartEncoding}
                    >
                      {session.isEncoding ? 'Encoding in Progress...' : 'Start Encoding'}
                    </Button>
                  </CardBody>
                </Card>
                {showFfmpegPreview && (
                  <div className="lg:col-span-3">
                    <FfmpegPreview
                      outputFormat={config.container}
                      outputDirectory={config.outputDirectory}
                      regexPattern={config.renamePattern}
                      threads={config.threads}
                      inputFiles={selectedJobs.map((j) => j.file.path)}
                      videoCodec={config.videoCodec}
                      encodingError={session.encodingError}
                      onClearError={() => session.setEncodingError(null)}
                      audioCodec={config.audioCodec}
                      audioChannels={config.audioChannels}
                      audioBitrate={config.audioBitrate}
                      volumeDb={config.volumeDb}
                      trackSelection={config.trackSelection}
                      crf={config.crf}
                      preset={config.preset}
                      ffmpegPath={ffmpegPath}
                    />
                  </div>
                )}
              </div>
            }
            logs={session.encodingLogs}
            onCancel={session.handleCancelEncoding}
            isEncoding={session.isEncoding}
            encodingProgress={session.encodingProgress}
            currentEncodingFile={session.currentEncodingFile}
          />
        )}
        {active === 'settings' && (
          <SettingsPage
            showFfmpegPreview={showFfmpegPreview}
            onShowFfmpegPreviewChange={setShowFfmpegPreview}
            hasNvidiaGpu={hasNvidiaGpu}
            logDirectory={config.logDirectory}
            onSelectLogDirectory={handleSelectLogFolder}
          />
        )}
        {active === 'about' && <AboutPage />}
      </Layout>

      <QueueDrawer
        isOpen={queue.isQueueOpen}
        onClose={() => queue.setIsQueueOpen(false)}
        jobs={queue.queuedJobs}
        onSelectJob={queue.handleFileSelect}
        selectedJobIds={queue.selectedJobIds}
        hasNvidiaGpu={hasNvidiaGpu}
        onSelectAll={queue.handleSelectAll}
        onClearSelection={queue.handleClearSelection}
        onRemoveJobs={queue.handleRemoveJobs}
        onEncode={() => {
          queue.setIsQueueOpen(false)
          session.handleStartEncoding()
        }}
        isEncoding={session.isEncoding}
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

      <FfmpegSetup
        isOpen={FORCE_FFMPEG_MODAL || showFfmpegSetup}
        onClose={handleFfmpegSetupClose}
        onSkip={handleFfmpegSetupSkip}
      />
    </>
  )
}

export default App
