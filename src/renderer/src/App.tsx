import { Button, Card, CardBody, Input, Select, SelectItem } from '@heroui/react'
import { useState, useEffect } from 'react'
import Layout from './components/layout'
import { SettingsPage } from './components/pages'
import { FfmpegPreview, FfmpegSetup } from './components/ffmpeg'
import { QueueDrawer } from './components/encoding'
import { buildFilenameFromPattern } from './utils/pattern'
import type { VideoFile, PatternTokens } from './types'

function App(): React.JSX.Element {
  // for debugging purposes
  const FORCE_FFMPEG_MODAL = false
  const [showFfmpegPreview, setShowFfmpegPreview] = useState<boolean>(false)

  // Main navigation state
  const [active, setActive] = useState<'encode' | 'settings' | 'about'>('encode')

  // FFmpeg setup state
  const [showFfmpegSetup, setShowFfmpegSetup] = useState<boolean>(false)
  const [ffmpegChecked, setFfmpegChecked] = useState<boolean>(false)

  // Queue related state
  const [isQueueOpen, setIsQueueOpen] = useState<boolean>(false)
  const [videoFiles, setVideoFiles] = useState<VideoFile[]>([])
  const [selectedFiles, setSelectedFiles] = useState<VideoFile[]>([])

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

  // Check FFmpeg installation on startup
  useEffect(() => {
    const checkFFmpeg = async (): Promise<void> => {
      // use localStorage to remember if user has already been prompted
      const hasBeenChecked = localStorage.getItem('ffmpeg-checked')
      if (hasBeenChecked) {
        setFfmpegChecked(true)
        return
      }

      try {
        const status = await window.api?.checkFfmpeg()
        if (!status?.isInstalled) {
          setShowFfmpegSetup(true)
        } else {
          setFfmpegChecked(true)
          localStorage.setItem('ffmpeg-checked', 'true')
        }
      } catch (error) {
        // Log error and show setup modal as fallback
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        console.error('Failed to check FFmpeg:', errorMessage)
        setShowFfmpegSetup(true)
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
        {active === 'encode' && (
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardBody className="h-64 border-2 border-dashed border-foreground/20 rounded-xl flex items-center justify-center text-foreground/70">
                <div className="text-center">
                  <p className="mb-4">Drag & drop files here</p>
                  <Button color="primary" variant="flat" onPress={handleSelectFolder}>
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
                  >
                    <SelectItem key="libx264">H.264 (libx264)</SelectItem>
                    <SelectItem key="libx265">H.265 (libx265)</SelectItem>
                    <SelectItem key="libvpx-vp9">VP9 (libvpx-vp9)</SelectItem>
                    <SelectItem key="av1_nvenc">AV1 (NVENC)</SelectItem>
                  </Select>
                  <Select
                    label="Preset"
                    selectedKeys={[preset]}
                    onSelectionChange={(keys) => setPreset(Array.from(keys)[0] as string)}
                    description="Speed vs Compression efficiency"
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
                    label="Quality (CRF)"
                    type="number"
                    value={crf.toString()}
                    onChange={(e) => setCrf(parseInt(e.target.value) || 23)}
                    description="0-51. Lower is better quality. 18-28 is good."
                  />
                  <Select
                    label="Audio Codec"
                    selectedKeys={[audioCodec]}
                    onSelectionChange={(keys) => setAudioCodec(Array.from(keys)[0] as string)}
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
                  />
                  <Select
                    label="Audio Channels"
                    selectedKeys={[audioChannels]}
                    onSelectionChange={(keys) => setAudioChannels(Array.from(keys)[0] as string)}
                    isDisabled={audioCodec === 'copy'}
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
                    isDisabled={audioCodec === 'copy'}
                  />
                  <Input
                    label="Volume Adjust (dB)"
                    type="number"
                    value={volumeDb.toString()}
                    onChange={(e) => setVolumeDb(parseFloat(e.target.value) || 0)}
                    description="Negative to reduce, positive to boost"
                    isDisabled={audioCodec === 'copy'}
                  />
                  <Select
                    label="Track Selection"
                    selectedKeys={[trackSelection]}
                    onSelectionChange={(keys) => setTrackSelection(Array.from(keys)[0] as string)}
                    description={
                      container !== 'mkv' && trackSelection === 'all'
                        ? 'Some formats may not support all stream types'
                        : 'Select which streams to include'
                    }
                  >
                    <SelectItem key="auto">Auto (Best Video & Audio)</SelectItem>
                    <SelectItem key="all_audio">All Audio Tracks</SelectItem>
                    <SelectItem key="all">All Tracks (Audio/Video/Subs)</SelectItem>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Input
                    label="Output directory"
                    placeholder="Choose folder..."
                    readOnly
                    value={outputDirectory}
                    onChange={(e) => setOutputDirectory(e.target.value)}
                  />
                  <Input
                    label="Rename pattern"
                    placeholder="e.g. {name}_{codec}"
                    value={renamePattern}
                    onChange={(e) => setRenamePattern(e.target.value)}
                    description="Tokens: {name} {codec} {ext}"
                  />
                  <div className="text-xs text-foreground/60">Preview: {getPreviewFilename()}</div>
                </div>
                <Button color="primary" isDisabled={!ffmpegChecked}>
                  Start Encoding
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
                  audioCodec={audioCodec}
                  audioChannels={audioChannels}
                  audioBitrate={audioBitrate}
                  volumeDb={volumeDb}
                  trackSelection={trackSelection}
                  crf={crf}
                  preset={preset}
                />
              </div>
            )}
          </div>
        )}
        {active === 'settings' && (
          <SettingsPage
            showFfmpegPreview={showFfmpegPreview}
            onShowFfmpegPreviewChange={setShowFfmpegPreview}
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
