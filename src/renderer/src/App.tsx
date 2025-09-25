import { Button, Card, CardBody, Input, Select, SelectItem } from '@heroui/react'
import { useState } from 'react'
import Layout from './components/Layout'
import Settings from './components/Settings'
import FfmpegPreview from './components/FfmpegPreview'
import QueueDrawer from './components/QueueDrawer'
import { buildFilenameFromPattern, PatternTokens } from './utils/pattern'

function App(): React.JSX.Element {
  const [active, setActive] = useState<'encode' | 'settings' | 'about'>('encode')
  const [showFfmpegPreview, setShowFfmpegPreview] = useState<boolean>(false)

  // Queue related state
  const [isQueueOpen, setIsQueueOpen] = useState<boolean>(false)
  const [videoFiles, setVideoFiles] = useState<
    Array<{
      name: string
      path: string
      size: number
      modified: number
    }>
  >([])
  const [selectedFiles, setSelectedFiles] = useState<
    Array<{
      name: string
      path: string
      size: number
      modified: number
    }>
  >([])

  const [container, setContainer] = useState<string>('mkv')
  const [videoCodec, setVideoCodec] = useState<string>('libx265')
  const [audioCodec, setAudioCodec] = useState<string>('aac')
  const [audioChannels, setAudioChannels] = useState<string>('same') // same, mono, stereo, 5.1
  const [audioBitrate, setAudioBitrate] = useState<number>(128)
  const [volumeDb, setVolumeDb] = useState<number>(0) // positive or negative dB
  const [renamePattern, setRenamePattern] = useState<string>('{name}_{codec}')
  const [outputDirectory, setOutputDirectory] = useState<string>('')
  const [threads, setThreads] = useState<number>(0)
  const [inputFiles] = useState<string[]>([])

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
      console.error('Error selecting folder:', error)
    }
  }

  const handleFileSelect = (file: {
    name: string
    path: string
    size: number
    modified: number
  }): void => {
    setSelectedFiles((prev) => {
      const isAlreadySelected = prev.some((selected) => selected.path === file.path)
      if (isAlreadySelected) {
        return prev.filter((selected) => selected.path !== file.path)
      } else {
        return [...prev, file]
      }
    })
  }

  const handleSelectAll = (): void => {
    setSelectedFiles(videoFiles)
  }

  const handleClearSelection = (): void => {
    setSelectedFiles([])
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
                    description="Common: 96-192 music, 64-128 speech"
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
                  <div className="text-xs text-foreground/60">
                    Preview:{' '}
                    {(() => {
                      const tokens: PatternTokens = {
                        name: 'example',
                        codec: videoCodec.replace('lib', ''),
                        ext: container
                      }
                      return buildFilenameFromPattern(renamePattern, tokens)
                    })()}
                  </div>
                </div>
                <Button color="primary">Start Encoding</Button>
              </CardBody>
            </Card>
            {showFfmpegPreview && (
              <div className="lg:col-span-3">
                <FfmpegPreview
                  outputFormat={container}
                  outputDirectory={outputDirectory}
                  regexPattern={renamePattern}
                  threads={threads}
                  inputFiles={inputFiles}
                  videoCodec={videoCodec}
                  audioCodec={audioCodec}
                  audioChannels={audioChannels}
                  audioBitrate={audioBitrate}
                  volumeDb={volumeDb}
                />
              </div>
            )}
          </div>
        )}
        {active === 'settings' && (
          <Settings
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
    </>
  )
}

export default App
