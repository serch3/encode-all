import { VIDEO_ENCODERS, maxQualityFor, videoEncoder } from '../../../../shared/encoders'
import { canUseTwoPass } from '../../../../shared/ffmpegArgs'
import {
  Tabs,
  Tab,
  Card,
  CardBody,
  Select,
  SelectItem,
  Input,
  Checkbox,
  RadioGroup,
  Radio
} from '@heroui/react'
import { useEffect, useMemo } from 'react'
import {
  boxIcon as BoxIcon,
  videoIcon as VideoIcon,
  cpuIcon as CpuIcon,
  settingIcon as SettingIcon,
  musicIcon as MusicIcon,
  volumeIcon as VolumeIcon,
  waveIcon as WaveIcon,
  layerIcon as LayerIcon
} from '../shared/icons'

interface EncodingSettingsProps {
  targetSizeMb?: number
  setTargetSizeMb?: (value: number) => void
  pixelFormat?: 'compatible' | 'preserve'
  setPixelFormat?: (value: 'compatible' | 'preserve') => void
  maxHeight?: number
  setMaxHeight?: (value: number) => void
  // Config state
  container: string
  setContainer: (value: string) => void
  videoCodec: string
  setVideoCodec: (value: string) => void
  audioCodec: string
  setAudioCodec: (value: string) => void
  audioChannels: string
  setAudioChannels: (value: string) => void
  audioBitrate: number
  setAudioBitrate: (value: number) => void
  volumeDb: number
  setVolumeDb: (value: number) => void
  crf: number
  setCrf: (value: number) => void
  preset: string
  setPreset: (value: string) => void
  threads: number
  setThreads: (value: number) => void
  trackSelection: string
  setTrackSelection: (value: string) => void

  // New props for features
  twoPass: boolean
  setTwoPass: (value: boolean) => void
  subtitleMode: string
  setSubtitleMode: (value: string) => void
  videoBitrate: number
  setVideoBitrate: (value: number) => void
  rateControlMode: 'crf' | 'bitrate'
  setRateControlMode: (value: 'crf' | 'bitrate') => void

  // Environment
  isEncoding: boolean
  hasNvidiaGpu: boolean
  supportedNvidiaEncoders?: string[]
  isCheckingHardware?: boolean
  supportedEncoders?: string[]
  isNvenc: boolean
}

export default function EncodingSettings({
  targetSizeMb = 0,
  setTargetSizeMb,
  pixelFormat = 'compatible',
  setPixelFormat,
  maxHeight = 0,
  setMaxHeight,
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
  crf,
  setCrf,
  preset,
  setPreset,
  threads,
  setThreads,
  trackSelection,
  setTrackSelection,
  videoBitrate,
  setVideoBitrate,
  rateControlMode,
  setRateControlMode,
  twoPass,
  setTwoPass,
  subtitleMode,
  setSubtitleMode,
  isEncoding,
  hasNvidiaGpu,
  supportedNvidiaEncoders,
  isCheckingHardware = false,
  supportedEncoders,
  isNvenc
}: EncodingSettingsProps): React.JSX.Element {
  const allVideoCodecs = useMemo(
    () =>
      VIDEO_ENCODERS.filter((encoder) => {
        if (supportedEncoders)
          return (
            supportedEncoders.includes(encoder.key) ||
            (isCheckingHardware && encoder.key === videoCodec)
          )
        if (encoder.backend === 'software' || encoder.backend === 'copy') return true
        return (
          encoder.backend === 'nvidia' &&
          ((isCheckingHardware && encoder.key === videoCodec) ||
            (hasNvidiaGpu &&
              (!supportedNvidiaEncoders || supportedNvidiaEncoders.includes(encoder.key))))
        )
      }),
    [supportedEncoders, isCheckingHardware, videoCodec, hasNvidiaGpu, supportedNvidiaEncoders]
  )

  const allAudioCodecs = useMemo(
    () => [
      { key: 'aac', label: 'AAC' },
      { key: 'libopus', label: 'Opus' },
      { key: 'copy', label: 'Copy' }
    ],
    []
  )

  const availableVideoCodecs = useMemo(
    () => allVideoCodecs.filter((codec) => codec.containers.includes(container)),
    [allVideoCodecs, container]
  )

  const availableAudioCodecs = useMemo(
    () =>
      allAudioCodecs.filter((codec) => {
        if (container === 'webm') return ['libopus', 'copy'].includes(codec.key)
        if (container === 'mov') return ['aac', 'copy'].includes(codec.key)
        return true // mkv, mp4 support all listed
      }),
    [allAudioCodecs, container]
  )

  const selectedVideoCodecKey = availableVideoCodecs.some((codec) => codec.key === videoCodec)
    ? videoCodec
    : ''
  const selectedAudioCodecKey = availableAudioCodecs.some((codec) => codec.key === audioCodec)
    ? audioCodec
    : ''

  const canEnableTwoPass = canUseTwoPass({ twoPass: true, videoCodec, rateControlMode })
  const apple = videoEncoder(videoCodec)?.backend === 'apple'
  useEffect(() => {
    if (apple && rateControlMode !== 'bitrate') setRateControlMode('bitrate')
  }, [apple, rateControlMode, setRateControlMode])
  const copyingVideo = videoCodec === 'copy'

  useEffect(() => {
    if (twoPass && !canEnableTwoPass) {
      setTwoPass(false)
    }
  }, [canEnableTwoPass, setTwoPass, twoPass])

  useEffect(() => {
    if (!isCheckingHardware && !selectedVideoCodecKey && availableVideoCodecs.length > 0) {
      setVideoCodec(availableVideoCodecs[0].key)
    }
  }, [availableVideoCodecs, isCheckingHardware, selectedVideoCodecKey, setVideoCodec])

  useEffect(() => {
    if (!selectedAudioCodecKey && availableAudioCodecs.length > 0) {
      setAudioCodec(availableAudioCodecs[0].key)
    }
  }, [availableAudioCodecs, selectedAudioCodecKey, setAudioCodec])

  return (
    <Card>
      <CardBody className="p-0">
        <Tabs
          aria-label="Encoding Settings"
          color="primary"
          variant="underlined"
          classNames={{
            tabList:
              'gap-1 w-full relative rounded-none p-0 border-b border-divider overflow-x-auto',
            cursor: 'w-full bg-primary',
            tab: 'max-w-fit shrink-0 px-3 h-12',
            tabContent: 'group-data-[selected=true]:text-primary'
          }}
        >
          <Tab
            key="video"
            title={
              <div className="flex items-center space-x-2">
                <VideoIcon className="w-4 h-4" />
                <span>Video</span>
              </div>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
              <Select
                label="Container"
                startContent={<BoxIcon className="w-5 h-5 text-default-400" />}
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
                startContent={<VideoIcon className="w-5 h-5 text-default-400" />}
                selectedKeys={selectedVideoCodecKey ? [selectedVideoCodecKey] : []}
                onSelectionChange={(keys) => setVideoCodec(Array.from(keys)[0] as string)}
                isDisabled={isEncoding}
              >
                {availableVideoCodecs.map((codec) => (
                  <SelectItem key={codec.key}>{codec.label}</SelectItem>
                ))}
              </Select>

              <Select
                label="Preset"
                startContent={<CpuIcon className="w-5 h-5 text-default-400" />}
                selectedKeys={[preset]}
                onSelectionChange={(keys) => setPreset(Array.from(keys)[0] as string)}
                description="Speed vs Compression efficiency"
                isDisabled={isEncoding || copyingVideo || apple}
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

              <div className="flex flex-col gap-2">
                <RadioGroup
                  label="Rate Control"
                  orientation="horizontal"
                  value={rateControlMode}
                  onValueChange={(val) => setRateControlMode(val as 'crf' | 'bitrate')}
                  isDisabled={isEncoding || copyingVideo}
                >
                  <Radio value="crf" isDisabled={apple}>
                    Constant Quality (CRF/CQ)
                  </Radio>
                  <Radio value="bitrate">Average Bitrate</Radio>
                </RadioGroup>

                {rateControlMode === 'crf' ? (
                  <Input
                    label={
                      isNvenc ||
                      videoEncoder(videoCodec)?.backend === 'intel' ||
                      videoEncoder(videoCodec)?.backend === 'amd'
                        ? 'Quality (CQ)'
                        : 'Quality (CRF)'
                    }
                    startContent={<SettingIcon className="w-5 h-5 text-default-400" />}
                    type="number"
                    value={crf.toString()}
                    min={0}
                    max={maxQualityFor(videoCodec)}
                    onChange={(e) => {
                      const value = parseInt(e.target.value)
                      if (Number.isFinite(value))
                        setCrf(Math.min(maxQualityFor(videoCodec), Math.max(0, value)))
                    }}
                    description={`0–${maxQualityFor(videoCodec)}. Lower is higher quality. Values apply to this encoder only.`}
                    isDisabled={isEncoding || copyingVideo}
                  />
                ) : (
                  <Input
                    label="Video Bitrate (kbps)"
                    startContent={<VideoIcon className="w-5 h-5 text-default-400" />}
                    type="number"
                    value={videoBitrate.toString()}
                    onChange={(e) => setVideoBitrate(parseInt(e.target.value) || 2500)}
                    description={
                      apple
                        ? 'Apple VideoToolbox uses average bitrate on Intel and Apple Silicon.'
                        : 'Target average bitrate.'
                    }
                    isDisabled={isEncoding || copyingVideo}
                  />
                )}
              </div>

              <Select
                label="Output compatibility"
                selectedKeys={[pixelFormat]}
                onSelectionChange={(keys) =>
                  setPixelFormat?.(Array.from(keys)[0] as 'compatible' | 'preserve')
                }
                isDisabled={isEncoding || copyingVideo}
                description="Compatible SDR uses 8-bit 4:2:0. Preserve source format for HDR or higher bit depth."
              >
                <SelectItem key="compatible">Compatible SDR</SelectItem>
                <SelectItem key="preserve">Preserve source format</SelectItem>
              </Select>
              <Select
                label="Maximum resolution"
                selectedKeys={[String(maxHeight)]}
                onSelectionChange={(keys) => setMaxHeight?.(Number(Array.from(keys)[0]))}
                isDisabled={isEncoding || copyingVideo}
                description="Keeps aspect ratio and does not upscale."
              >
                <SelectItem key="0">Source resolution</SelectItem>
                <SelectItem key="480">480p</SelectItem>
                <SelectItem key="720">720p</SelectItem>
                <SelectItem key="1080">1080p</SelectItem>
                <SelectItem key="1440">1440p</SelectItem>
                <SelectItem key="2160">2160p</SelectItem>
              </Select>
              {rateControlMode === 'bitrate' && (
                <Input
                  label="Target size per file (MB)"
                  type="number"
                  min={0}
                  value={targetSizeMb ? String(targetSizeMb) : ''}
                  placeholder="Optional"
                  onValueChange={(value) => setTargetSizeMb?.(Math.max(0, Number(value) || 0))}
                  isDisabled={isEncoding || copyingVideo}
                  description="Approximate target using source duration and audio budget. Review shows each file's calculated bitrate."
                />
              )}
              <div className="flex flex-col gap-2 justify-center">
                <Checkbox
                  isSelected={twoPass}
                  onValueChange={setTwoPass}
                  isDisabled={isEncoding || !canEnableTwoPass}
                >
                  Two-Pass Encoding
                </Checkbox>
                <p className="text-tiny text-default-400 pl-7">
                  {canEnableTwoPass
                    ? 'Encodes twice for better quality/size ratio. Slower.'
                    : 'Requires average bitrate mode and a software video encoder.'}
                </p>
              </div>
              {copyingVideo && (
                <p role="status" className="col-span-full text-sm text-default-600">
                  Stream copy keeps the original video quality. Preset and quality controls apply
                  when you choose a video encoder.
                </p>
              )}
            </div>
          </Tab>

          <Tab
            key="audio"
            title={
              <div className="flex items-center space-x-2">
                <MusicIcon className="w-4 h-4" />
                <span>Audio</span>
              </div>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
              <Select
                label="Audio Codec"
                startContent={<MusicIcon className="w-5 h-5 text-default-400" />}
                selectedKeys={selectedAudioCodecKey ? [selectedAudioCodecKey] : []}
                onSelectionChange={(keys) => setAudioCodec(Array.from(keys)[0] as string)}
                isDisabled={isEncoding}
              >
                {availableAudioCodecs.map((codec) => (
                  <SelectItem key={codec.key}>{codec.label}</SelectItem>
                ))}
              </Select>

              <Select
                label="Audio Channels"
                startContent={<VolumeIcon className="w-5 h-5 text-default-400" />}
                selectedKeys={[audioChannels]}
                onSelectionChange={(keys) => setAudioChannels(Array.from(keys)[0] as string)}
                isDisabled={audioCodec === 'copy' || isEncoding}
              >
                <SelectItem key="same">Same</SelectItem>
                <SelectItem key="mono">Mono</SelectItem>
                <SelectItem key="stereo">Stereo</SelectItem>
                <SelectItem key="5.1">5.1</SelectItem>
              </Select>

              <Input
                label="Audio Bitrate (kbps)"
                startContent={<WaveIcon className="w-5 h-5 text-default-400" />}
                type="number"
                value={audioBitrate.toString()}
                onChange={(e) => setAudioBitrate(parseInt(e.target.value) || 0)}
                description="Common: 256-320k (music), 192k (e.g, youtube)"
                isDisabled={audioCodec === 'copy' || isEncoding}
              />

              <Input
                label="Volume Adjust (dB)"
                startContent={<VolumeIcon className="w-5 h-5 text-default-400" />}
                type="number"
                value={volumeDb.toString()}
                onChange={(e) => setVolumeDb(parseFloat(e.target.value) || 0)}
                description="Negative to reduce, positive to boost"
                isDisabled={audioCodec === 'copy' || isEncoding}
              />
            </div>
          </Tab>

          <Tab
            key="subtitles"
            title={
              <div className="flex items-center space-x-2">
                <LayerIcon className="w-4 h-4" />
                <span>Subtitles</span>
              </div>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
              <Select
                label="Subtitle Mode"
                startContent={<LayerIcon className="w-5 h-5 text-default-400" />}
                selectedKeys={[subtitleMode]}
                onSelectionChange={(keys) => setSubtitleMode(Array.from(keys)[0] as string)}
                isDisabled={isEncoding}
              >
                <SelectItem key="none">None (Remove Subtitles)</SelectItem>
                <SelectItem key="copy">Passthrough (Copy All)</SelectItem>
                <SelectItem key="text">Convert text subtitles</SelectItem>
              </Select>
            </div>
          </Tab>

          <Tab
            key="advanced"
            title={
              <div className="flex items-center space-x-2">
                <CpuIcon className="w-4 h-4" />
                <span>Advanced</span>
              </div>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
              <Input
                label="Threads"
                startContent={<CpuIcon className="w-5 h-5 text-default-400" />}
                type="number"
                value={threads.toString()}
                onChange={(e) => setThreads(parseInt(e.target.value) || 0)}
                description="0 = auto"
                isDisabled={isEncoding}
              />

              <Select
                label="Track Selection"
                startContent={<LayerIcon className="w-5 h-5 text-default-400" />}
                selectedKeys={[trackSelection]}
                onSelectionChange={(keys) => setTrackSelection(Array.from(keys)[0] as string)}
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
          </Tab>
        </Tabs>
      </CardBody>
    </Card>
  )
}
