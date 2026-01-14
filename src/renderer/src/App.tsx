import { Button, Card, CardBody, Input, Select, SelectItem } from '@heroui/react'
import { useState, useEffect, useRef } from 'react'
import Layout from './components/layout'
import { SettingsPage, GeneralPage } from './components/pages'
import { FfmpegPreview, FfmpegSetup } from './components/ffmpeg'
import { QueueDrawer } from './components/encoding'
import { buildFilenameFromPattern } from './utils/pattern'
import type { VideoFile, PatternTokens, EncodingOptions } from './types'

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

  // Encoding configuration state
  const [container, setContainer] = useState<string>('mkv')
  const [videoCodec, setVideoCodec] = useState<string>('libx265')
  const [audioCodec, setAudioCodec] = useState<string>('aac')
  const [audioChannels, setAudioChannels] = useState<string>('same')
  const [audioBitrate, setAudioBitrate] = useState<number>(128)
  const [volumeDb, setVolumeDb] = useState<number>(0)
  const [renamePattern, setRenamePattern] = useState<string>('{name}_{codec}')
  const [outputDirectory, setOutputDirectory] = useState<string>('')
  const [threads, setThreads] = useState<number>(0)
  const [trackSelection, setTrackSelection] = useState<string>('auto')
  const [crf, setCrf] = useState<number>(23)
  const [preset, setPreset] = useState<string>('medium')
  const [logDirectory, setLogDirectory] = useState<string>(() => localStorage.getItem('logDirectory') || '')

  const isNvenc = videoCodec.includes('nvenc')
  const isEncodingRef = useRef(false)

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
    setEncodingError(null)
    setEncodingLogs(['Starting encoding process...'])

    for (const file of selectedFiles) {
      if (!isEncodingRef.current) {
        setEncodingLogs((prev) => [...prev, 'Queue processing stopped.'])
        break
      }

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
        logDirectory
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

          const cleanup = (): void => {
            removeComplete()
            removeError()
          }

          window.api.startEncoding(options)
        })

        setEncodingLogs((prev) => [...prev, `Completed: ${file.name}`])

        // Remove from queue and selection upon success
        setVideoFiles((prev) => prev.filter((f) => f.path !== file.path))
        setSelectedFiles((prev) => prev.filter((f) => f.path !== file.path))
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
                  className={`lg:col-span-2 transition-colors ${
                    isDragging ? 'border-primary bg-primary/10' : ''
                  }`}
                >
                  <CardBody
                    className={`h-64 border-2 border-dashed ${
                      isDragging ? 'border-primary' : 'border-foreground/20'
                    } rounded-xl flex items-center justify-center text-foreground/70 transition-colors`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <div className="text-center">
                      <p className="mb-4">Drag & drop files here</p>
                      <Button
                        color="primary"
                        variant="flat"
                        onPress={handleSelectFolder}
                        isDisabled={isEncoding}
                      >
                        Or select folder
                      </Button>
                    </div>
                  </CardBody>
                </Card>
                <Card>
                  <CardBody className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Select
                        label="Container"
                        selectedKeys={[container]}
                        onSelectionChange={(keys) => setContainer(Array.from(keys)[0] as string)}
                        isDisabled={isEncoding}
                      >
                        <SelectItem key="mp4">MP4</SelectItem>
                        <SelectItem key="mkv">MKV</SelectItem>
                        <SelectItem key="webm">WebM</SelectItem>
                        <SelectItem key="mov">MOV</SelectItem>
                      </Select>
                      <Select
                        label="Video Codec"
                        selectedKeys={[videoCodec]}
                        onSelectionChange={(keys) => setVideoCodec(Array.from(keys)[0] as string)}
                        isDisabled={isEncoding}
                      >
                        {[
                          { key: 'libx264', label: 'H.264 (libx264)' },
                          { key: 'libx265', label: 'H.265 (libx265)' },
                          { key: 'libvpx-vp9', label: 'VP9 (libvpx-vp9)' },
                          ...(hasNvidiaGpu
                            ? [
                                { key: 'h264_nvenc', label: 'H.264 (NVIDIA NVENC)' },
                                { key: 'hevc_nvenc', label: 'H.265 (NVIDIA NVENC)' },
                                { key: 'av1_nvenc', label: 'AV1 (NVIDIA NVENC)' }
                              ]
                            : [])
                        ].map((codec) => (
                          <SelectItem key={codec.key}>{codec.label}</SelectItem>
                        ))}
                      </Select>
                      <Select
                        label="Preset"
                        selectedKeys={[preset]}
                        onSelectionChange={(keys) => setPreset(Array.from(keys)[0] as string)}
                        description="Speed vs Compression efficiency"
                        isDisabled={isEncoding}
                      >
                        <SelectItem key="ultrafast">Ultrafast</SelectItem>
                        <SelectItem key="superfast">Superfast</SelectItem>
                        <SelectItem key="veryfast">Veryfast</SelectItem>
                        <SelectItem key="faster">Faster</SelectItem>
                        <SelectItem key="fast">Fast</SelectItem>
                        <SelectItem key="medium">Medium</SelectItem>
                        <SelectItem key="slow">Slow</SelectItem>
                        <SelectItem key="slower">Slower</SelectItem>
                        <SelectItem key="veryslow">Veryslow</SelectItem>
                      </Select>
                      <Input
                        label={isNvenc ? 'Quality (CQ)' : 'Quality (CRF)'}
                        type="number"
                        value={crf.toString()}
                        onChange={(e) => setCrf(parseInt(e.target.value) || 23)}
                        description={
                          isNvenc
                            ? '1-51. Lower is better quality.'
                            : '0-51. Lower is better quality. 18-28 is good.'
                        }
                        isDisabled={isEncoding}
                      />
                      <Select
                        label="Audio Codec"
                        selectedKeys={[audioCodec]}
                        onSelectionChange={(keys) => setAudioCodec(Array.from(keys)[0] as string)}
                        isDisabled={isEncoding}
                      >
                        <SelectItem key="aac">AAC</SelectItem>
                        <SelectItem key="copy">Copy</SelectItem>
                        <SelectItem key="libopus">Opus</SelectItem>
                      </Select>
                      <Input
                        label="Threads"
                        type="number"
                        value={threads.toString()}
                        onChange={(e) => setThreads(parseInt(e.target.value) || 0)}
                        description="0 = auto"
                        isDisabled={isEncoding}
                      />
                      <Select
                        label="Audio Channels"
                        selectedKeys={[audioChannels]}
                        onSelectionChange={(keys) =>
                          setAudioChannels(Array.from(keys)[0] as string)
                        }
                        isDisabled={audioCodec === 'copy' || isEncoding}
                      >
                        <SelectItem key="same">Same</SelectItem>
                        <SelectItem key="mono">Mono</SelectItem>
                        <SelectItem key="stereo">Stereo</SelectItem>
                        <SelectItem key="5.1">5.1</SelectItem>
                      </Select>
                      <Input
                        label="Audio Bitrate (kbps)"
                        type="number"
                        value={audioBitrate.toString()}
                        onChange={(e) => setAudioBitrate(parseInt(e.target.value) || 0)}
                        description="Common: 256-320k (music), 192k (e.g, youtube)"
                        isDisabled={audioCodec === 'copy' || isEncoding}
                      />
                      <Input
                        label="Volume Adjust (dB)"
                        type="number"
                        value={volumeDb.toString()}
                        onChange={(e) => setVolumeDb(parseFloat(e.target.value) || 0)}
                        description="Negative to reduce, positive to boost"
                        isDisabled={audioCodec === 'copy' || isEncoding}
                      />
                      <Select
                        label="Track Selection"
                        selectedKeys={[trackSelection]}
                        onSelectionChange={(keys) =>
                          setTrackSelection(Array.from(keys)[0] as string)
                        }
                        description={
                          container !== 'mkv' && trackSelection === 'all'
                            ? 'Some formats may not support all stream types'
                            : 'Select which streams to include'
                        }
                        isDisabled={isEncoding}
                      >
                        <SelectItem key="auto">Auto (Best Video & Audio)</SelectItem>
                        <SelectItem key="all_audio">All Audio Tracks</SelectItem>
                        <SelectItem key="all">All Tracks (Audio/Video/Subs)</SelectItem>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2 items-end">
                        <Input
                          label="Output directory"
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
        {active === 'about' && <div>About this app…</div>}
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
