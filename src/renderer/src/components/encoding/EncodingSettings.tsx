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
  isNvenc: boolean
}

export default function EncodingSettings({
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
  isNvenc
}: EncodingSettingsProps): React.JSX.Element {
  return (
    <Card>
      <CardBody className="p-0">
        <Tabs
          aria-label="Encoding Settings"
          color="primary"
          variant="underlined"
          classNames={{
            tabList: 'gap-6 w-full relative rounded-none p-0 border-b border-divider',
            cursor: 'w-full bg-primary',
            tab: 'max-w-fit px-4 h-12',
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
                startContent={<CpuIcon className="w-5 h-5 text-default-400" />}
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

              <div className="flex flex-col gap-2">
                <RadioGroup
                  label="Rate Control"
                  orientation="horizontal"
                  value={rateControlMode}
                  onValueChange={(val) => setRateControlMode(val as 'crf' | 'bitrate')}
                  isDisabled={isEncoding}
                >
                  <Radio value="crf">Constant Quality (CRF/CQ)</Radio>
                  <Radio value="bitrate">Average Bitrate</Radio>
                </RadioGroup>

                {rateControlMode === 'crf' ? (
                  <Input
                    label={isNvenc ? 'Quality (CQ)' : 'Quality (CRF)'}
                    startContent={<SettingIcon className="w-5 h-5 text-default-400" />}
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
                ) : (
                  <Input
                    label="Video Bitrate (kbps)"
                    startContent={<VideoIcon className="w-5 h-5 text-default-400" />}
                    type="number"
                    value={videoBitrate.toString()}
                    onChange={(e) => setVideoBitrate(parseInt(e.target.value) || 2500)}
                    description="Target average bitrate."
                    isDisabled={isEncoding}
                  />
                )}
              </div>

              <div className="flex flex-col gap-2 justify-center">
                <Checkbox isSelected={twoPass} onValueChange={setTwoPass} isDisabled={isEncoding}>
                  Two-Pass Encoding
                </Checkbox>
                <p className="text-tiny text-default-400 pl-7">
                  {twoPass && rateControlMode === 'crf'
                    ? 'Warning: Two-Pass usually ineffective with CRF depending on codec.'
                    : 'Encodes twice for better quality/size ratio. Slower.'}
                </p>
              </div>
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
                selectedKeys={[audioCodec]}
                onSelectionChange={(keys) => setAudioCodec(Array.from(keys)[0] as string)}
                isDisabled={isEncoding}
              >
                <SelectItem key="aac">AAC</SelectItem>
                <SelectItem key="copy">Copy</SelectItem>
                <SelectItem key="libopus">Opus</SelectItem>
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
