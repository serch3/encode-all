import { Button, Card, CardBody, Input } from '@heroui/react'
import { useState, useEffect, useRef } from 'react'
import { ArrowUpToLine, FolderOpen, History } from 'lucide-react'
import { useLocalStorage } from './hooks/useLocalStorage'
import { editIcon as EditIcon, folderIcon as FolderIcon } from './components/shared/icons'
import Layout from './components/layout'
import { SettingsPage, GeneralPage, AboutPage } from './components/pages'
import { FfmpegPreview, FfmpegSetup } from './components/ffmpeg'
import { QueueDrawer, ProfileManager, EncodingSettings } from './components/encoding'
import { buildFilenameFromPattern } from './utils/pattern'
import type { VideoFile, PatternTokens, EncodingOptions, EncodingProfile } from './types'

function App(): React.JSX.Element {
  // for debugging purposes
  const FORCE_FFMPEG_MODAL = false
  const [showFfmpegPreview, setShowFfmpegPreview] = useState<boolean>(false)

  // Main navigation state
  const [active, setActive] = useState<'general' | 'settings' | 'about'>('general')

  // FFmpeg setup state
  const [showFfmpegSetup, setShowFfmpegSetup] = useState<boolean>(false)
  const [ffmpegChecked, setFfmpegChecked] = useState<boolean>(false)
  const [hasNvidiaGpu, setHasNvidiaGpu] = useState<boolean>(false)
  const [ffmpegPath, setFfmpegPath] = useState<string | undefined>(undefined)

  // Queue related state
  const [isQueueOpen, setIsQueueOpen] = useState<boolean>(false)
  const [videoFiles, setVideoFiles] = useState<VideoFile[]>([])
  const [selectedFiles, setSelectedFiles] = useState<VideoFile[]>([])

  // Encoding state
  const [encodingProgress, setEncodingProgress] = useState<number>(0)
  const [encodingLogs, setEncodingLogs] = useState<string[]>([])
  const [currentEncodingFile, setCurrentEncodingFile] = useState<string>('')
  const [isEncoding, setIsEncoding] = useState<boolean>(false)
  const [encodingError, setEncodingError] = useState<string | null>(null)

  // ETA and Overall Progress calculation
  const [queueStartTime, setQueueStartTime] = useState<number | null>(null)
  const [completedFilesCount, setCompletedFilesCount] = useState<number>(0)
  const [totalQueueSize, setTotalQueueSize] = useState<number>(0)
  const [eta, setEta] = useState<string>('--')

  // Encoding configuration state
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

  const isNvenc = videoCodec.includes('nvenc')
  const isEncodingRef = useRef(false)
  const shouldSkipRef = useRef(false)

  // Drag and drop state
  const [isDragging, setIsDragging] = useState<boolean>(false)

  // Check FFmpeg installation on startup
  useEffect(() => {
    const checkFFmpeg = async (): Promise<void> => {
      // use localStorage to remember if user has already been prompted
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

  // handler for skipping FFmpeg setup
  const handleFfmpegSetupSkip = (): void => {
    setShowFfmpegSetup(false)
    setFfmpegChecked(true)
  }

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    if (!isEncoding) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()

    // Only set dragging to false if we're actually leaving the drop zone
    // and not just entering a child element
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return
    }

    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (isEncoding) return

    const files = Array.from(e.dataTransfer.files)
    const validExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v', '.ts']

    const newVideoFiles: VideoFile[] = files
      .filter((file) => {
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
        return validExtensions.includes(ext)
      })
      .map((file) => ({
        name: file.name,
        path: (file as any).path,
        size: file.size,
        modified: file.lastModified
      }))

    if (newVideoFiles.length > 0) {
      setVideoFiles((prev) => {
        const existingPaths = new Set(prev.map((f) => f.path))
        const uniqueNewFiles = newVideoFiles.filter((f) => !existingPaths.has(f.path))
        return [...prev, ...uniqueNewFiles]
      })
      setIsQueueOpen(true)
    }
  }

  // Queue functions
  const handleSelectFolder = async (): Promise<void> => {
    try {
      const folderPath = await window.api.selectFolder()
      if (folderPath) {
        const files = await window.api.readVideoFiles(folderPath)
        setVideoFiles(files)
        setIsQueueOpen(true)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to select folder'
      console.error('Error selecting folder:', errorMessage)
      // TODO: add error toast/notification
    }
  }

  const handleFileSelect = (file: VideoFile): void => {
    setSelectedFiles((prev) => {
      const isAlreadySelected = prev.some((selected) => selected.path === file.path)
      if (isAlreadySelected) {
        return prev.filter((selected) => selected.path !== file.path)
      }
      return [...prev, file]
    })
  }

  const handleSelectAll = (): void => {
    setSelectedFiles(videoFiles)
  }

  const handleClearSelection = (): void => {
    setSelectedFiles([])
  }

  const processQueue = async (): Promise<void> => {
    isEncodingRef.current = true
    setIsEncoding(true)
    setTotalQueueSize(selectedFiles.length)
    setQueueStartTime(Date.now())
    setCompletedFilesCount(0)

    setEncodingError(null)
    setEncodingLogs(['Starting encoding process...'])

    const now = new Date()
    const jobTimestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`

    for (const file of selectedFiles) {
      if (!isEncodingRef.current) {
        setEncodingLogs((prev) => [...prev, 'Queue processing stopped.'])
        break
      }

      // Reset skip flag for new file
      shouldSkipRef.current = false

      setCurrentEncodingFile(file.name)
      setEncodingProgress(0)
      setEncodingLogs((prev) => [...prev, `\nProcessing: ${file.name}`])

      // Calculate output filename
      const tokens: PatternTokens = {
        name: file.name.substring(0, file.name.lastIndexOf('.')),
        codec: videoCodec.replace('lib', ''),
        ext: container
      }
      const outputFilename = buildFilenameFromPattern(renamePattern, tokens)
      const finalFilename = outputFilename.toLowerCase().endsWith(`.${container.toLowerCase()}`)
        ? outputFilename
        : `${outputFilename}.${container}`

      // Determine output directory: use selected directory or fallback to input file's directory
      let targetDir = outputDirectory
      if (!targetDir) {
        const lastSlash = Math.max(file.path.lastIndexOf('/'), file.path.lastIndexOf('\\'))
        targetDir = file.path.substring(0, lastSlash)
      }

      const outputPath = await window.api.pathJoin(targetDir, finalFilename)

      const options = {
        inputPath: file.path,
        outputPath,
        container,
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
      } as EncodingOptions

      try {
        await new Promise<void>((resolve, reject) => {
          const removeComplete = window.api.onEncodingComplete(() => {
            cleanup()
            resolve()
          })
          const removeError = window.api.onEncodingError((err) => {
            cleanup()
            reject(new Error(err))
          })

          let cleanup = (): void => {
            removeComplete()
            removeError()
          }

          // Check if skip was pressed while setting up
          if (shouldSkipRef.current) {
            resolve()
            return
          }

          window.api.startEncoding(options)

          // Poll for skip request
          // Ideally we send an IPC message to cancel current but keep queue running
          const skipChecker = setInterval(() => {
            if (shouldSkipRef.current) {
              window.api.cancelEncoding().then(() => {
                cleanup()
                setEncodingLogs((prev) => [...prev, `Skipped: ${file.name}`])
                resolve() // Resolve properly to continue loop
              })
              clearInterval(skipChecker)
            }
          }, 500)

          // Ensure interval clears on completion/error
          const originalCleanup = cleanup
          // @ts-ignore - overriding localized function
          cleanup = () => {
            clearInterval(skipChecker)
            originalCleanup()
          }
        })

        if (!shouldSkipRef.current) {
          setEncodingLogs((prev) => [...prev, `Completed: ${file.name}`])
        }

        // Remove from queue and selection upon success OR SKIP
        setVideoFiles((prev) => prev.filter((f) => f.path !== file.path))
        setSelectedFiles((prev) => prev.filter((f) => f.path !== file.path))
        setCompletedFilesCount((prev) => prev + 1)
        setEncodingProgress(0)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        setEncodingLogs((prev) => [...prev, `Error encoding ${file.name}: ${msg}`])
        setEncodingError(msg)
        // Stop queue on error so user can see it
        isEncodingRef.current = false
        break
      }
    }

    setIsEncoding(false)
    // Only clear isEncodingRef if we finished normally or cancelled,
    // but we already set it to false in catch block if error.
    // If we finished loop normally:
    if (isEncodingRef.current) {
      isEncodingRef.current = false
      setEncodingLogs((prev) => [...prev, '\nAll tasks finished.'])
    } else if (encodingError) {
      setEncodingLogs((prev) => [...prev, '\nQueue stopped due to error.'])
    } else {
      setEncodingLogs((prev) => [...prev, '\nQueue stopped.'])
    }
  }

  const handleStartEncoding = (): void => {
    if (selectedFiles.length === 0) return
    void processQueue()
  }

  const handleCancelEncoding = async (): Promise<void> => {
    isEncodingRef.current = false
    setIsEncoding(false)
    await window.api.cancelEncoding()
    setEncodingLogs((prev) => [...prev, 'Encoding cancelled by user.'])
  }

  const handleSkipCurrent = (): void => {
    shouldSkipRef.current = true
    setEncodingLogs((prev) => [...prev, 'Skipping current file...'])
  }

  const handleSaveQueue = async (filesToSave: VideoFile[]): Promise<void> => {
    try {
      const content = JSON.stringify(filesToSave, null, 2)
      await window.api.saveTextFile(content, 'queue.json')
    } catch (error) {
      console.error('Failed to save queue', error)
    }
  }

  const handleLoadQueue = async (): Promise<void> => {
    try {
      const content = await window.api.readTextFile()
      if (content) {
        const files = JSON.parse(content) as VideoFile[]
        // Validate basic structure
        if (Array.isArray(files) && files.every((f) => f.path && f.name)) {
          setVideoFiles(files)
          setSelectedFiles(files) // Auto select loaded
          setIsQueueOpen(true)
        }
      }
    } catch (error) {
      console.error('Failed to load queue', error)
    }
  }

  // Listen for progress and logs
  useEffect(() => {
    const removeProgress = window.api.onEncodingProgress((p) => setEncodingProgress(p))
    const removeLog = window.api.onEncodingLog((l) => {
      setEncodingLogs((prev) => {
        const newLogs = [...prev, l]
        if (newLogs.length > 1000) return newLogs.slice(-1000)
        return newLogs
      })
    })

    return () => {
      removeProgress()
      removeLog()
    }
  }, [])

  // Calculate overall progress
  const overallProgress =
    totalQueueSize > 0
      ? Math.min(100, ((completedFilesCount + encodingProgress / 100) / totalQueueSize) * 100)
      : 0

  // Calculate ETA
  useEffect(() => {
    if (!isEncoding || !queueStartTime || overallProgress <= 0 || overallProgress >= 100) {
      if (!isEncoding) setEta('--')
      return
    }

    const formatDuration = (ms: number): string => {
      if (ms < 0) return '0s'
      const seconds = Math.floor((ms / 1000) % 60)
      const minutes = Math.floor((ms / (1000 * 60)) % 60)
      const hours = Math.floor(ms / (1000 * 60 * 60))

      if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
      if (minutes > 0) return `${minutes}m ${seconds}s`
      return `${seconds}s`
    }

    const updateEta = (): void => {
      const elapsed = Date.now() - queueStartTime
      const estimatedTotal = elapsed / (overallProgress / 100)
      const remaining = estimatedTotal - elapsed
      setEta(formatDuration(remaining))
    }

    updateEta() // Initial update
    const interval = setInterval(updateEta, 1000)

    return () => clearInterval(interval)
  }, [isEncoding, queueStartTime, overallProgress])

  const handleSelectOutputDirectory = async (): Promise<void> => {
    try {
      const folderPath = await window.api.selectFolder()
      if (folderPath) {
        setOutputDirectory(folderPath)
      }
    } catch (error) {
      console.error('Error selecting output directory:', error)
    }
  }

  const handleSelectLogFolder = async (): Promise<void> => {
    try {
      const folderPath = await window.api.selectFolder()
      if (folderPath) {
        setLogDirectory(folderPath)
        localStorage.setItem('logDirectory', folderPath)
      }
    } catch (error) {
      console.error('Failed to select log folder:', error)
    }
  }

  const handleLoadProfile = (profile: EncodingProfile): void => {
    setContainer(profile.container)
    setVideoCodec(profile.videoCodec)
    setAudioCodec(profile.audioCodec)
    setAudioChannels(profile.audioChannels)
    setAudioBitrate(profile.audioBitrate)
    setVolumeDb(profile.volumeDb)
    setThreads(profile.threads)
    setTrackSelection(profile.trackSelection)
    setCrf(profile.crf)
    setPreset(profile.preset)
    setRenamePattern(profile.renamePattern)
    setVideoBitrate(profile.videoBitrate ?? 2500)
    setRateControlMode(profile.rateControlMode ?? 'crf')
    setTwoPass(profile.twoPass ?? false)
    setSubtitleMode(profile.subtitleMode ?? 'none')
  }

  const handleSaveProfile = (profile: EncodingProfile): void => {
    setSavedProfiles([...savedProfiles, profile])
  }

  const handleDeleteProfile = (id: string): void => {
    setSavedProfiles(savedProfiles.filter((p) => p.id !== id))
  }

  // Generate preview of filename pattern
  const getPreviewFilename = (): string => {
    const tokens: PatternTokens = {
      name: 'example',
      codec: videoCodec.replace('lib', ''),
      ext: container
    }
    return buildFilenameFromPattern(renamePattern, tokens)
  }

  return (
    <>
      <Layout
        title="Encode All"
        active={active}
        onSelect={setActive}
        onOpenQueue={() => setIsQueueOpen(true)}
        queueStats={{ total: videoFiles.length, selected: selectedFiles.length }}
      >
        {active === 'general' && (
          <GeneralPage
            encoderContent={
              <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
                <Card
                  className={
                    `lg:col-span-2 group border bg-content1/60 backdrop-blur-md transition-all duration-200 ease-out will-change-transform ` +
                    (isDragging
                      ? 'border-primary/30 shadow-md'
                      : 'border-default-200/60 hover:border-primary/30 hover:shadow-lg hover:-translate-y-[1px]')
                  }
                >
                  <CardBody
                    className={
                      `relative h-64 rounded-2xl overflow-hidden p-0 transition-colors duration-200 ` +
                      (isEncoding ? 'cursor-not-allowed' : 'cursor-pointer') +
                      ' focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
                    }
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => {
                      if (!isEncoding) void handleSelectFolder()
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (isEncoding) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        void handleSelectFolder()
                      }
                    }}
                  >
                    <div
                      className={
                        `absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-black/10 ` +
                        `group-hover:from-black/20 group-hover:to-primary/20 transition-opacity duration-200 ` +
                        (isDragging ? 'opacity-100' : 'opacity-40 group-hover:opacity-85')
                      }
                    />
                    <div
                      className={
                        `absolute inset-3 rounded-2xl border border-dashed transition-colors duration-200 ` +
                        (isDragging
                          ? 'border-primary/70'
                          : 'border-default-300/60 group-hover:border-primary/40')
                      }
                    />

                    <div className="relative h-full w-full flex flex-col items-center justify-center px-6 text-center">
                      <div
                        className={
                          `mb-4 inline-flex items-center justify-center rounded-full p-3 border shadow-sm transition-colors duration-200 ` +
                          (isDragging
                            ? 'bg-primary/10 text-primary border-primary/30'
                            : 'bg-content2/70 text-default-500 border-default-200/70 group-hover:bg-primary/10 group-hover:text-primary')
                        }
                      >
                        <ArrowUpToLine size={26} />
                      </div>

                      <div className="space-y-1">
                        <p className="text-xl font-semibold tracking-tight text-foreground">
                          {isDragging ? 'Drop to add to queue' : 'Drop videos here'}
                        </p>
                        <p className="text-small text-default-500">
                          or click to browse a folder • MP4, MKV, AVI, MOV, WebM
                        </p>
                      </div>

                      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                        <Button
                          color="primary"
                          variant="shadow"
                          onPress={handleSelectFolder}
                          isDisabled={isEncoding}
                          startContent={<FolderOpen size={18} />}
                        >
                          Browse Folder
                        </Button>
                        <Button
                          variant="light"
                          onPress={handleLoadQueue}
                          isDisabled={isEncoding}
                          startContent={<History size={18} />}
                        >
                          Load Session
                        </Button>
                      </div>

                      <p className="mt-3 text-tiny text-default-400">
                        Tip: Saved sessions can be reloaded anytime.
                      </p>
                    </div>
                  </CardBody>
                </Card>
                <Card>
                  <CardBody className="flex flex-col gap-4">
                    <ProfileManager
                      currentSettings={{
                        container,
                        videoCodec,
                        audioCodec,
                        audioChannels,
                        audioBitrate,
                        volumeDb,
                        threads,
                        trackSelection,
                        crf,
                        preset,
                        renamePattern,
                        videoBitrate,
                        rateControlMode,
                        twoPass,
                        subtitleMode
                      }}
                      profiles={savedProfiles}
                      onLoadProfile={handleLoadProfile}
                      onSaveProfile={handleSaveProfile}
                      onDeleteProfile={handleDeleteProfile}
                    />
                    <EncodingSettings
                      container={container}
                      setContainer={setContainer}
                      videoCodec={videoCodec}
                      setVideoCodec={setVideoCodec}
                      audioCodec={audioCodec}
                      setAudioCodec={setAudioCodec}
                      audioChannels={audioChannels}
                      setAudioChannels={setAudioChannels}
                      audioBitrate={audioBitrate}
                      setAudioBitrate={setAudioBitrate}
                      volumeDb={volumeDb}
                      setVolumeDb={setVolumeDb}
                      crf={crf}
                      setCrf={setCrf}
                      preset={preset}
                      setPreset={setPreset}
                      threads={threads}
                      setThreads={setThreads}
                      trackSelection={trackSelection}
                      setTrackSelection={setTrackSelection}
                      videoBitrate={videoBitrate}
                      setVideoBitrate={setVideoBitrate}
                      rateControlMode={rateControlMode}
                      setRateControlMode={setRateControlMode}
                      twoPass={twoPass}
                      setTwoPass={setTwoPass}
                      subtitleMode={subtitleMode}
                      setSubtitleMode={setSubtitleMode}
                      isEncoding={isEncoding}
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
                          value={outputDirectory}
                          className="flex-1"
                          isDisabled={isEncoding}
                        />
                        <Button
                          variant="flat"
                          onPress={handleSelectOutputDirectory}
                          className="h-14"
                          isDisabled={isEncoding}
                        >
                          Browse
                        </Button>
                      </div>
                      <Input
                        label="Rename pattern"
                        startContent={<EditIcon className="w-5 h-5 text-default-400" />}
                        placeholder="e.g. {name}_{codec}"
                        value={renamePattern}
                        onChange={(e) => setRenamePattern(e.target.value)}
                        description="Tokens: {name} {codec} {ext}"
                        isDisabled={isEncoding}
                      />
                      <div className="text-xs text-foreground/60">
                        Preview: {getPreviewFilename()}
                      </div>
                    </div>
                    <Button
                      color="primary"
                      isDisabled={!ffmpegChecked || selectedFiles.length === 0 || isEncoding}
                      onPress={handleStartEncoding}
                    >
                      {isEncoding ? 'Encoding in Progress...' : 'Start Encoding'}
                    </Button>
                  </CardBody>
                </Card>
                {showFfmpegPreview && (
                  <div className="lg:col-span-3">
                    <FfmpegPreview
                      outputFormat={container}
                      outputDirectory={outputDirectory}
                      regexPattern={renamePattern}
                      threads={threads}
                      inputFiles={selectedFiles.map((f) => f.path)}
                      videoCodec={videoCodec}
                      encodingError={encodingError}
                      onClearError={() => setEncodingError(null)}
                      audioCodec={audioCodec}
                      audioChannels={audioChannels}
                      audioBitrate={audioBitrate}
                      volumeDb={volumeDb}
                      trackSelection={trackSelection}
                      crf={crf}
                      preset={preset}
                      ffmpegPath={ffmpegPath}
                    />
                  </div>
                )}
              </div>
            }
            logs={encodingLogs}
            onCancel={handleCancelEncoding}
            isEncoding={isEncoding}
            encodingProgress={encodingProgress}
            currentEncodingFile={currentEncodingFile}
          />
        )}
        {active === 'settings' && (
          <SettingsPage
            showFfmpegPreview={showFfmpegPreview}
            onShowFfmpegPreviewChange={setShowFfmpegPreview}
            hasNvidiaGpu={hasNvidiaGpu}
            logDirectory={logDirectory}
            onSelectLogDirectory={handleSelectLogFolder}
          />
        )}
        {active === 'about' && <AboutPage />}
      </Layout>

      <QueueDrawer
        isOpen={isQueueOpen}
        onClose={() => setIsQueueOpen(false)}
        videoFiles={videoFiles}
        onSelectFile={handleFileSelect}
        selectedFiles={selectedFiles}
        onSelectAll={handleSelectAll}
        onClearSelection={handleClearSelection}
        onEncode={() => {
          setIsQueueOpen(false)
          handleStartEncoding()
        }}
        isEncoding={isEncoding}
        onSkipCurrent={handleSkipCurrent}
        onSaveQueue={handleSaveQueue}
        onLoadQueue={handleLoadQueue}
        overallProgress={overallProgress}
        eta={eta}
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
