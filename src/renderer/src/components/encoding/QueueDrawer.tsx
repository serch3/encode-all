import React from 'react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  Button,
  Card,
  CardBody,
  Chip,
  ScrollShadow,
  Input,
  Tooltip,
  ButtonGroup,
  Progress,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Checkbox,
  Divider,
  Spinner
} from '@heroui/react'
import type { QueuedJob, EncodingOptions, MediaInfo } from '../../types'
import {
  Save,
  Upload,
  SkipForward,
  Edit,
  Trash2,
  CheckSquare,
  X,
  Search as SearchIcon,
  Layers
} from 'lucide-react'

interface QueueDrawerProps {
  isOpen: boolean
  onClose: () => void
  jobs: QueuedJob[]
  onSelectJob?: (jobId: string) => void
  selectedJobIds?: string[]
  onSelectAll?: () => void
  onClearSelection?: () => void
  onRemoveJobs?: (jobIds: string[]) => void
  onEncode?: () => void
  isEncoding?: boolean
  onSkipCurrent?: () => void
  onSaveQueue?: (jobs: QueuedJob[]) => void
  onLoadQueue?: () => void
  overallProgress?: number
  eta?: string
  maxConcurrency?: number
  setMaxConcurrency?: (value: number) => void
  maxRetries?: number
  setMaxRetries?: (value: number) => void
  onUpdateJobOverrides?: (
    jobId: string,
    overrides: Partial<EncodingOptions>,
    maxRetries?: number
  ) => void
  hasNvidiaGpu?: boolean
}

export default function QueueDrawer({
  isOpen,
  onClose,
  jobs,
  onSelectJob,
  selectedJobIds = [],
  onSelectAll,
  onClearSelection,
  onRemoveJobs,
  onEncode,
  isEncoding,
  onSkipCurrent,
  onSaveQueue,
  onLoadQueue,
  overallProgress,
  eta,
  maxConcurrency,
  setMaxConcurrency,
  maxRetries,
  setMaxRetries,
  onUpdateJobOverrides,
  hasNvidiaGpu = false
}: QueueDrawerProps): React.JSX.Element {
  const formatFileSize = (bytes: number): string => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString()
  }

  /** Returns a compact one-line summary for use in the job card */
  const getMediaSummary = (job: QueuedJob): string | null => {
    const info = job.mediaInfo
    if (!info) return null
    const video = info.streams.find((s) => s.codec_type === 'video')
    const audios = info.streams.filter((s) => s.codec_type === 'audio')
    const parts: string[] = []
    if (video) {
      if (video.width && video.height) parts.push(`${video.width}×${video.height}`)
      parts.push(video.codec_name.toUpperCase())
      if (video.r_frame_rate) {
        const [n, d] = video.r_frame_rate.split('/').map(Number)
        if (d) parts.push(`${Math.round(n / d)}fps`)
      }
    }
    if (audios.length > 0) {
      const a = audios[0]
      const chLabel = a.channels ? ` ${a.channels}ch` : ''
      parts.push(`${a.codec_name.toUpperCase()}${chLabel}`)
      if (audios.length > 1) parts.push(`+${audios.length - 1} audio`)
    }
    if (info.format.duration) {
      const secs = parseFloat(info.format.duration)
      const h = Math.floor(secs / 3600)
      const m = Math.floor((secs % 3600) / 60)
      const s = Math.floor(secs % 60)
      parts.push(h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`)
    }
    return parts.join(' · ')
  }

  /** Renders a detailed stream list for the override modal */
  const renderModalMediaInfo = (info: MediaInfo): React.JSX.Element => {
    const videoStreams = info.streams.filter((s) => s.codec_type === 'video')
    const audioStreams = info.streams.filter((s) => s.codec_type === 'audio')
    const subStreams = info.streams.filter((s) => s.codec_type === 'subtitle')
    const fmtBitrate = (bps?: string): string => {
      if (!bps) return ''
      const n = parseInt(bps)
      return n > 1_000_000
        ? ` · ${(n / 1_000_000).toFixed(1)} Mb/s`
        : ` · ${Math.round(n / 1000)} kb/s`
    }
    const fmtDuration = (dur?: string): string => {
      if (!dur) return ''
      const secs = parseFloat(dur)
      const h = Math.floor(secs / 3600)
      const m = Math.floor((secs % 3600) / 60)
      const s = Math.floor(secs % 60)
      return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`
    }
    return (
      <div className="rounded-lg bg-default-100 p-3 text-xs space-y-2 font-mono">
        {videoStreams.map((v, i) => (
          <div key={i} className="flex flex-wrap gap-x-2 gap-y-0.5 text-default-600">
            <span className="text-primary font-semibold">VIDEO</span>
            <span>
              {v.codec_name.toUpperCase()}
              {v.profile ? ` (${v.profile})` : ''}
            </span>
            {v.width && v.height && (
              <span>
                {v.width}×{v.height}
              </span>
            )}
            {v.r_frame_rate &&
              (() => {
                const [n, d] = v.r_frame_rate.split('/').map(Number)
                return d ? <span>{Math.round(n / d)} fps</span> : null
              })()}
            {v.pix_fmt && <span>{v.pix_fmt}</span>}
            {v.bit_rate && <span>{fmtBitrate(v.bit_rate).trim()}</span>}
          </div>
        ))}
        {audioStreams.map((a, i) => {
          const lang = a.tags?.language
          return (
            <div key={i} className="flex flex-wrap gap-x-2 gap-y-0.5 text-default-600">
              <span className="text-secondary font-semibold">AUDIO</span>
              <span>{a.codec_name.toUpperCase()}</span>
              {a.channels && (
                <span>
                  {a.channels}ch{a.channel_layout ? ` (${a.channel_layout})` : ''}
                </span>
              )}
              {a.sample_rate && <span>{parseInt(a.sample_rate) / 1000} kHz</span>}
              {a.bit_rate && <span>{fmtBitrate(a.bit_rate).trim()}</span>}
              {lang && lang !== 'und' && <span className="uppercase text-default-400">{lang}</span>}
            </div>
          )
        })}
        {subStreams.map((s, i) => {
          const lang = s.tags?.language
          return (
            <div key={i} className="flex flex-wrap gap-x-2 gap-y-0.5 text-default-500">
              <span className="font-semibold">SUB</span>
              <span>{s.codec_name.toUpperCase()}</span>
              {lang && lang !== 'und' && <span className="uppercase">{lang}</span>}
            </div>
          )
        })}
        {(info.format.duration || info.format.bit_rate) && (
          <div className="flex gap-x-2 text-default-400 pt-0.5 border-t border-default-200">
            {info.format.duration && <span>{fmtDuration(info.format.duration)}</span>}
            {info.format.bit_rate && <span>{fmtBitrate(info.format.bit_rate).trim()} total</span>}
          </div>
        )}
      </div>
    )
  }

  const isSelected = (jobId: string): boolean => {
    return selectedJobIds.includes(jobId)
  }

  const totalSize = jobs.reduce((acc, j) => acc + j.file.size, 0)
  const formatTotalSize = formatFileSize(totalSize)
  const [search, setSearch] = React.useState('')
  const filtered = search
    ? jobs.filter((job) => job.file.name.toLowerCase().includes(search.toLowerCase()))
    : jobs

  const [editingJob, setEditingJob] = React.useState<QueuedJob | null>(null)
  const [overrideForm, setOverrideForm] = React.useState<Partial<EncodingOptions>>({})
  const [overrideRetries, setOverrideRetries] = React.useState<number>(maxRetries ?? 0)

  const openEdit = (job: QueuedJob): void => {
    setEditingJob(job)
    setOverrideForm(job.overrides ?? {})
    setOverrideRetries(job.maxRetries ?? maxRetries ?? 0)
  }

  const closeEdit = (): void => {
    setEditingJob(null)
    setOverrideForm({})
  }

  const handleOverrideChange = (
    field: keyof EncodingOptions,
    value: string | number | boolean
  ): void => {
    setOverrideForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleOverrideSave = (): void => {
    if (!editingJob) return
    onUpdateJobOverrides?.(editingJob.id, overrideForm, overrideRetries)
    closeEdit()
  }

  return (
    <Drawer isOpen={isOpen} onClose={onClose} size="lg">
      <DrawerContent>
        <DrawerHeader className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-primary rounded flex items-center justify-center text-white text-xs font-bold">
              ▶
            </div>
            <h2 className="text-xl font-semibold">Video Queue</h2>
          </div>
          <div className="text-xs text-default-500 flex flex-wrap gap-3">
            <span>{jobs.length} files</span>
            <span>{selectedJobIds.length} selected</span>
            <span>{formatTotalSize}</span>
          </div>
        </DrawerHeader>

        <DrawerBody>
          {isEncoding && overallProgress !== undefined && (
            <div className="flex flex-col gap-2 mb-4 bg-content2 p-3 rounded-medium">
              <div className="flex items-center justify-between text-small">
                <span className="font-medium">Total Progress</span>
                <div className="flex items-center gap-2 text-default-500 font-mono">
                  <span>{Math.round(overallProgress)}%</span>
                  {eta && <span>{`ETA: ${eta}`}</span>}
                </div>
              </div>
              <Progress
                size="sm"
                value={overallProgress}
                color="primary"
                aria-label="Overall encoding progress"
              />
            </div>
          )}
          {/* Toolbar */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row justify-between gap-3 items-end sm:items-center">
              <Input
                size="sm"
                placeholder="Filter files..."
                value={search}
                onValueChange={setSearch}
                startContent={<SearchIcon size={14} className="text-default-400" />}
                className="w-full sm:max-w-[240px]"
                variant="faded"
                isClearable
                onClear={() => setSearch('')}
              />

              <div className="flex gap-3 w-full sm:w-auto justify-end items-center">
                <ButtonGroup size="sm" variant="flat" isDisabled={jobs.length === 0 || isEncoding}>
                  <Button onPress={() => onSelectAll?.()} startContent={<CheckSquare size={14} />}>
                    Select All
                  </Button>
                  <Button onPress={() => onClearSelection?.()} startContent={<X size={14} />}>
                    Deselect
                  </Button>
                </ButtonGroup>

                <div className="h-4 w-px bg-default-300 mx-1 hidden sm:block" />

                <Button
                  size="sm"
                  color="danger"
                  variant="flat"
                  onPress={() => onRemoveJobs?.(selectedJobIds)}
                  isDisabled={selectedJobIds.length === 0 || isEncoding}
                  startContent={<Trash2 size={16} />}
                  className="font-medium"
                >
                  Remove {selectedJobIds.length > 0 ? `(${selectedJobIds.length})` : ''}
                </Button>
              </div>
            </div>

            {(setMaxConcurrency || setMaxRetries) && (
              <div className="gap-4 py-3 px-1 border-t border-dashed border-default-200">
                <div className="flex items-center gap-1.5 text-tiny text-default-400 uppercase tracking-widest font-semibold min-w-fit">
                  <Layers size={14} />
                  Queue Settings
                </div>
                <div className="flex flex-wrap gap-6 flex-1 items-center">
                  {setMaxConcurrency && (
                    <div className="flex items-center gap-3 min-w-[12rem]">
                      <span className="text-small text-default-500">Concurrency:</span>
                      <Input
                        size="sm"
                        type="number"
                        value={(maxConcurrency ?? 1).toString()}
                        onChange={(e) =>
                          setMaxConcurrency(Math.max(1, parseInt(e.target.value) || 1))
                        }
                        className="w-20"
                        classNames={{ input: 'text-right' }}
                        isDisabled={isEncoding}
                        min={1}
                      />
                    </div>
                  )}
                  {setMaxRetries && (
                    <div className="flex items-center gap-3 min-w-[12rem]">
                      <span className="text-small text-default-500">Retries:</span>
                      <Input
                        size="sm"
                        type="number"
                        value={(maxRetries ?? 0).toString()}
                        onChange={(e) => setMaxRetries(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-20"
                        classNames={{ input: 'text-right' }}
                        isDisabled={isEncoding}
                        min={0}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <ScrollShadow className="h-full w-full overflow-x-hidden">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 bg-default-100 rounded-full flex items-center justify-center mb-4">
                  <span className="text-2xl">🎥</span>
                </div>
                <h3 className="text-lg font-medium text-default-600 mb-2">No matches</h3>
                <p className="text-sm text-default-500">
                  {jobs.length === 0
                    ? 'Select a folder to scan for video files'
                    : 'Try a different search term'}
                </p>
              </div>
            ) : (
              <div className="px-4 py-2 w-full">
                <div className="space-y-2 w-full">
                  {filtered.map((job) => (
                    <Card
                      key={job.id}
                      isPressable={!!onSelectJob && !isEncoding}
                      onPress={() => !isEncoding && onSelectJob?.(job.id)}
                      className={`transition-shadow duration-150 border-0 shadow-sm w-full min-w-0 ${
                        !isEncoding ? 'hover:shadow-md' : ''
                      } ${
                        isSelected(job.id)
                          ? 'ring-1 ring-primary/30 bg-primary/5 shadow-primary/20'
                          : isEncoding
                            ? 'opacity-60 cursor-not-allowed'
                            : 'hover:bg-default-50/80'
                      }`}
                    >
                      <CardBody className="px-3 py-2 w-full min-w-0">
                        <div className="flex items-center justify-between gap-2 h-full w-full min-w-0">
                          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                            <h4
                              className="font-medium text-sm text-foreground truncate leading-tight block"
                              title={job.file.name}
                            >
                              {job.file.name}
                            </h4>

                            <div className="flex items-center gap-2 text-xs text-default-500 flex-wrap mt-0.5">
                              <span className="font-mono">{formatFileSize(job.file.size)}</span>
                              <span className="text-default-300">•</span>
                              <span>{formatDate(job.file.modified)}</span>
                              <span className="text-default-300">•</span>
                              <span className="font-mono uppercase">{job.status}</span>
                              {job.status === 'encoding' && (
                                <span className="font-mono text-primary">
                                  {Math.round(job.progress)}%
                                </span>
                              )}
                            </div>
                            {/* Media info row */}
                            {!job.mediaInfo && !job.mediaInfoError && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <Spinner size="sm" className="scale-75" />
                                <span className="text-[10px] text-default-400">Probing…</span>
                              </div>
                            )}
                            {job.mediaInfo &&
                              (() => {
                                const summary = getMediaSummary(job)
                                return summary ? (
                                  <div
                                    className="mt-0.5 text-[11px] text-default-400 font-mono truncate"
                                    title={summary}
                                  >
                                    {summary}
                                  </div>
                                ) : null
                              })()}
                          </div>

                          <div className="flex items-center gap-2">
                            <Tooltip content="Edit per-file overrides">
                              <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                color={
                                  job.overrides && Object.keys(job.overrides).length > 0
                                    ? 'danger'
                                    : 'default'
                                }
                                onPress={() => {
                                  openEdit(job)
                                }}
                              >
                                <Edit size={16} />
                              </Button>
                            </Tooltip>
                            <Tooltip content="Remove from queue">
                              <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                color="danger"
                                onPress={() => {
                                  onRemoveJobs?.([job.id])
                                }}
                                isDisabled={isEncoding}
                              >
                                <Trash2 size={16} />
                              </Button>
                            </Tooltip>
                            {isSelected(job.id) && (
                              <Chip
                                size="sm"
                                color="primary"
                                variant="flat"
                                className="text-[10px] px-2 py-0 h-5 flex-shrink-0"
                              >
                                Selected
                              </Chip>
                            )}
                          </div>
                        </div>
                        {job.status === 'encoding' && (
                          <div className="mt-2">
                            <Progress
                              size="sm"
                              value={job.progress}
                              color="primary"
                              aria-label={`Progress for ${job.file.name}`}
                            />
                          </div>
                        )}
                      </CardBody>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </ScrollShadow>
        </DrawerBody>

        <Modal isOpen={!!editingJob} onClose={closeEdit} backdrop="blur">
          <ModalContent>
            <ModalHeader className="flex flex-col gap-1">
              <span>Edit overrides</span>
              {editingJob && (
                <span
                  className="text-xs font-normal text-default-500 truncate max-w-xs"
                  title={editingJob.file.name}
                >
                  {editingJob.file.name}
                </span>
              )}
            </ModalHeader>
            <ModalBody className="gap-3">
              {editingJob?.mediaInfo && (
                <>
                  {renderModalMediaInfo(editingJob.mediaInfo)}
                  <Divider />
                </>
              )}
              <Select
                label="Container"
                selectedKeys={overrideForm.container ? [overrideForm.container] : []}
                onSelectionChange={(keys) =>
                  handleOverrideChange('container', Array.from(keys)[0] as string)
                }
              >
                <SelectItem key="mp4">MP4</SelectItem>
                <SelectItem key="mkv">MKV</SelectItem>
                <SelectItem key="webm">WebM</SelectItem>
                <SelectItem key="mov">MOV</SelectItem>
              </Select>
              <Select
                label="Video Codec"
                selectedKeys={overrideForm.videoCodec ? [overrideForm.videoCodec] : []}
                onSelectionChange={(keys) =>
                  handleOverrideChange('videoCodec', Array.from(keys)[0] as string)
                }
              >
                {[
                  { key: 'libx264', label: 'H.264 (libx264)' },
                  { key: 'libx265', label: 'H.265 (libx265)' },
                  { key: 'libvpx-vp9', label: 'VP9 (libvpx-vp9)' },
                  { key: 'copy', label: 'Copy (no re-encode)' },
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
                label="Audio Codec"
                selectedKeys={overrideForm.audioCodec ? [overrideForm.audioCodec] : []}
                onSelectionChange={(keys) =>
                  handleOverrideChange('audioCodec', Array.from(keys)[0] as string)
                }
              >
                <SelectItem key="aac">AAC</SelectItem>
                <SelectItem key="libopus">Opus</SelectItem>
                <SelectItem key="copy">Copy (no re-encode)</SelectItem>
              </Select>
              <Select
                label="Rate control"
                selectedKeys={overrideForm.rateControlMode ? [overrideForm.rateControlMode] : []}
                onSelectionChange={(keys) =>
                  handleOverrideChange('rateControlMode', Array.from(keys)[0] as 'crf' | 'bitrate')
                }
              >
                <SelectItem key="crf">CRF/CQ</SelectItem>
                <SelectItem key="bitrate">Bitrate</SelectItem>
              </Select>
              {overrideForm.rateControlMode === 'bitrate' ? (
                <Input
                  label="Video bitrate (kbps)"
                  type="number"
                  value={overrideForm.videoBitrate?.toString() ?? ''}
                  onChange={(e) =>
                    handleOverrideChange('videoBitrate', parseInt(e.target.value) || 0)
                  }
                />
              ) : (
                <Input
                  label="CRF/CQ"
                  type="number"
                  value={overrideForm.crf?.toString() ?? ''}
                  onChange={(e) => handleOverrideChange('crf', parseInt(e.target.value) || 0)}
                />
              )}
              <Select
                label="Preset"
                selectedKeys={overrideForm.preset ? [overrideForm.preset] : []}
                onSelectionChange={(keys) =>
                  handleOverrideChange('preset', Array.from(keys)[0] as string)
                }
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
              <Select
                label="Subtitle Mode"
                selectedKeys={overrideForm.subtitleMode ? [overrideForm.subtitleMode] : []}
                onSelectionChange={(keys) =>
                  handleOverrideChange('subtitleMode', Array.from(keys)[0] as string)
                }
              >
                <SelectItem key="none">None (Remove Subtitles)</SelectItem>
                <SelectItem key="copy">Passthrough (Copy All)</SelectItem>
              </Select>
              <Checkbox
                isSelected={overrideForm.twoPass ?? false}
                onValueChange={(val) => handleOverrideChange('twoPass', val)}
              >
                Two-pass
              </Checkbox>
              <Input
                label="Per-file max retries"
                type="number"
                value={(overrideRetries ?? 0).toString()}
                onChange={(e) => setOverrideRetries(Math.max(0, parseInt(e.target.value) || 0))}
              />
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={closeEdit}>
                Cancel
              </Button>
              <Button color="primary" onPress={handleOverrideSave}>
                Save overrides
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        <DrawerFooter className="flex flex-col gap-2">
          <div className="flex justify-between items-center w-full px-2 pb-2">
            <ButtonGroup variant="flat" size="sm">
              <Tooltip content="Save current queue state to file">
                <Button
                  isIconOnly
                  onPress={() =>
                    onSaveQueue?.(
                      selectedJobIds.length > 0
                        ? jobs.filter((j) => selectedJobIds.includes(j.id))
                        : jobs
                    )
                  }
                >
                  <Save size={16} />
                </Button>
              </Tooltip>
              <Tooltip content="Load queue from file">
                <Button isIconOnly onPress={onLoadQueue}>
                  <Upload size={16} />
                </Button>
              </Tooltip>
            </ButtonGroup>

            {isEncoding && (
              <Button
                size="sm"
                color="warning"
                variant="flat"
                onPress={onSkipCurrent}
                startContent={<SkipForward size={16} />}
              >
                Skip Current
              </Button>
            )}
          </div>
          <div className="flex gap-2 w-full">
            <Button variant="flat" onPress={onClose} className="flex-1">
              Close
            </Button>
            {selectedJobIds.length > 0 && (
              <Button color="primary" className="flex-1" onPress={onEncode} isDisabled={isEncoding}>
                {isEncoding
                  ? 'Encoding...'
                  : `Encode ${selectedJobIds.length} file${selectedJobIds.length !== 1 ? 's' : ''}`}
              </Button>
            )}
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
