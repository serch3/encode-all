import { VIDEO_ENCODERS, maxQualityFor } from '../../../../shared/encoders'
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
  Divider,
  Spinner
} from '@heroui/react'
import type { QueuedJob, EncodingOptions, MediaInfo } from '../../types'
import type { QueueFeedback } from '../../hooks/useQueueManager'
import { MAX_QUEUE_CONCURRENCY, MAX_QUEUE_RETRIES } from '../../constants/queue'
import {
  Save,
  Upload,
  SkipForward,
  Edit,
  Trash2,
  CheckSquare,
  Square,
  X,
  Search as SearchIcon,
  Layers,
  Video
} from 'lucide-react'

interface QueueDrawerProps {
  isOpen: boolean
  onClose: () => void
  jobs: QueuedJob[]
  onSelectJob?: (jobId: string) => void
  selectedJobIds?: string[]
  onSelectAll?: (jobIds?: string[]) => void
  onClearSelection?: (jobIds?: string[]) => void
  onRemoveJobs?: (jobIds: string[]) => void
  onEncode?: () => void
  isEncoding?: boolean
  canEncode?: boolean
  encodeDisabledReason?: string
  queueFeedback?: QueueFeedback | null
  isLocked?: boolean
  lockReason?: string
  removedCount?: number
  onUndoRemove?: () => void
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
  supportedNvidiaEncoders?: string[]
  supportedEncoders?: string[]
  continueOnError?: boolean
  onContinueOnErrorChange?: (value: boolean) => void
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
  canEncode = true,
  encodeDisabledReason,
  queueFeedback,
  isLocked = false,
  lockReason,
  removedCount = 0,
  onUndoRemove,
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
  hasNvidiaGpu = false,
  supportedNvidiaEncoders,
  supportedEncoders,
  continueOnError,
  onContinueOnErrorChange
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

  const selectedSet = React.useMemo(() => new Set(selectedJobIds), [selectedJobIds])
  const isSelected = (jobId: string): boolean => selectedSet.has(jobId)

  const totalSize = jobs.reduce((acc, j) => acc + j.file.size, 0)
  const formatTotalSize = formatFileSize(totalSize)
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const query = search.trim().toLowerCase()
  const filtering = !!query || statusFilter !== 'all'
  const filtered = jobs.filter(
    (job) =>
      (!query || job.file.name.toLowerCase().includes(query)) &&
      (statusFilter === 'all' || job.status === statusFilter)
  )
  const [page, setPage] = React.useState(0)
  const visibleRows = filtered.slice(page * 50, (page + 1) * 50)
  React.useEffect(() => {
    setPage(0)
  }, [query, statusFilter, jobs.length])
  const clearFilters = (): void => {
    setSearch('')
    setStatusFilter('all')
  }
  const visibleSelectedIds = filtered.filter((job) => isSelected(job.id)).map((job) => job.id)
  const hiddenSelectedCount = selectedJobIds.length - visibleSelectedIds.length
  const runnableCount = jobs.filter(
    (job) => isSelected(job.id) && ['pending', 'error', 'canceled'].includes(job.status)
  ).length
  const selectionLocked = !!isEncoding || isLocked
  const disabledReason = selectionLocked
    ? isEncoding
      ? 'Queue changes are paused while encoding.'
      : (lockReason ?? 'Queue changes are paused while generating a preview.')
    : (encodeDisabledReason ??
      (selectedJobIds.length === 0
        ? 'Select videos to start encoding.'
        : runnableCount === 0
          ? 'The selected videos are already complete. Select pending files or add videos.'
          : undefined))

  const [editingJob, setEditingJob] = React.useState<QueuedJob | null>(null)
  const [overrideForm, setOverrideForm] = React.useState<Partial<EncodingOptions>>({})
  const [overrideRetries, setOverrideRetries] = React.useState<number>(maxRetries ?? 0)

  const openEdit = (job: QueuedJob): void => {
    if (selectionLocked) return
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
    value: string | number | boolean | undefined
  ): void => {
    setOverrideForm((prev) => {
      const next = { ...prev, [field]: value }
      if (value === undefined) delete next[field]
      return next
    })
  }

  const handleOverrideSave = (): void => {
    if (!editingJob || selectionLocked) return
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

        <DrawerBody className="min-h-0 overflow-hidden gap-3">
          {onContinueOnErrorChange && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!continueOnError}
                disabled={isEncoding || isLocked}
                onChange={(event) => onContinueOnErrorChange(event.target.checked)}
              />
              Continue with other files after an error
            </label>
          )}

          {removedCount > 0 && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 text-sm text-default-600"
            >
              <span>
                Removed {removedCount} video{removedCount === 1 ? '' : 's'} from the queue.
              </span>
              <Button size="sm" variant="flat" onPress={onUndoRemove} isDisabled={selectionLocked}>
                Undo removal
              </Button>
            </div>
          )}
          {queueFeedback && (
            <p
              role={queueFeedback.isError ? 'alert' : 'status'}
              className={`text-sm rounded-lg px-3 py-2 ${queueFeedback.isError ? 'bg-danger/10 text-danger' : 'bg-primary/5 text-default-600'}`}
            >
              {queueFeedback.message}
            </p>
          )}
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
          <div className="flex flex-col gap-3 shrink-0">
            <div className="flex flex-col gap-3">
              <Input
                label="Search"
                aria-label="Filter queued videos"
                size="sm"
                placeholder="Filter files..."
                value={search}
                onValueChange={setSearch}
                startContent={<SearchIcon size={14} className="text-default-400" />}
                className="w-full"
                variant="faded"
                isClearable
                onClear={() => setSearch('')}
              />
              <Select
                label="Queue status"
                size="sm"
                selectedKeys={[statusFilter]}
                onSelectionChange={(keys) => setStatusFilter(String(Array.from(keys)[0] ?? 'all'))}
              >
                <SelectItem key="all">All files</SelectItem>
                <SelectItem key="pending">Pending</SelectItem>
                <SelectItem key="encoding">Encoding</SelectItem>
                <SelectItem key="error">Failed</SelectItem>
                <SelectItem key="complete">Complete</SelectItem>
                <SelectItem key="canceled">Canceled</SelectItem>
              </Select>

              <div className="flex flex-wrap gap-2 w-full items-center">
                <ButtonGroup
                  size="sm"
                  variant="flat"
                  isDisabled={filtered.length === 0 || selectionLocked}
                >
                  <Button
                    onPress={() =>
                      onSelectAll?.(filtering ? filtered.map((job) => job.id) : undefined)
                    }
                    isDisabled={filtered.length === 0 || selectionLocked}
                    startContent={<CheckSquare size={14} />}
                  >
                    {filtering ? 'Select matches' : 'Select All'}
                  </Button>
                  <Button
                    onPress={() =>
                      onClearSelection?.(filtering ? filtered.map((job) => job.id) : undefined)
                    }
                    isDisabled={filtered.length === 0 || selectionLocked}
                    startContent={<X size={14} />}
                  >
                    {filtering ? 'Deselect matches' : 'Deselect'}
                  </Button>
                </ButtonGroup>

                <div className="h-4 w-px bg-default-300 mx-1 hidden sm:block" />

                <Button
                  size="sm"
                  color="danger"
                  variant="flat"
                  onPress={() => onRemoveJobs?.(visibleSelectedIds)}
                  isDisabled={visibleSelectedIds.length === 0 || selectionLocked}
                  startContent={<Trash2 size={16} />}
                  className="font-medium"
                >
                  Remove {filtering ? 'matches' : 'selected'}{' '}
                  {visibleSelectedIds.length > 0 ? `(${visibleSelectedIds.length})` : ''}
                </Button>
              </div>
            </div>
            {filtering && (
              <p role="status" className="text-xs text-default-600">
                {filtered.length} of {jobs.length} files match.
                {hiddenSelectedCount > 0 &&
                  ` ${hiddenSelectedCount} selected outside this filter; encoding includes all selected files.`}
              </p>
            )}

            {(setMaxConcurrency || setMaxRetries) && (
              <div className="gap-4 py-3 px-1 border-t border-dashed border-default-200">
                <div className="flex items-center gap-1.5 text-tiny text-default-400 uppercase tracking-widest font-semibold min-w-fit">
                  <Layers size={14} />
                  Queue Settings
                </div>
                <div className="flex flex-wrap gap-6 flex-1 items-center">
                  {setMaxConcurrency && (
                    <div className="flex items-center gap-3 min-w-[12rem]">
                      <span className="text-small text-default-500">Parallel jobs:</span>
                      <Input
                        aria-label="Parallel encoding jobs"
                        size="sm"
                        type="number"
                        value={(maxConcurrency ?? 1).toString()}
                        onChange={(e) =>
                          setMaxConcurrency(
                            Math.min(
                              MAX_QUEUE_CONCURRENCY,
                              Math.max(1, parseInt(e.target.value) || 1)
                            )
                          )
                        }
                        className="w-20"
                        classNames={{ input: 'text-right' }}
                        isDisabled={isEncoding || isLocked}
                        min={1}
                        max={MAX_QUEUE_CONCURRENCY}
                      />
                    </div>
                  )}
                  {setMaxRetries && (
                    <div className="flex items-center gap-3 min-w-[12rem]">
                      <span className="text-small text-default-500">Retries:</span>
                      <Input
                        aria-label="Automatic retries"
                        size="sm"
                        type="number"
                        value={(maxRetries ?? 0).toString()}
                        onChange={(e) =>
                          setMaxRetries(
                            Math.min(MAX_QUEUE_RETRIES, Math.max(0, parseInt(e.target.value) || 0))
                          )
                        }
                        className="w-20"
                        classNames={{ input: 'text-right' }}
                        isDisabled={isEncoding || isLocked}
                        min={0}
                        max={MAX_QUEUE_RETRIES}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <ScrollShadow className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-20 h-20 bg-default-100 rounded-full flex items-center justify-center mb-6 text-default-400">
                  <Video className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  {jobs.length === 0 ? 'Queue is empty' : 'No matching videos'}
                </h3>
                <p className="text-sm text-default-500 max-w-xs mx-auto">
                  {jobs.length === 0
                    ? 'Add some video files to the workspace to start encoding.'
                    : 'No files match your current search or status filter.'}
                </p>
                {filtering && (
                  <Button size="sm" variant="flat" onPress={clearFilters} className="mt-4">
                    Clear filter
                  </Button>
                )}
              </div>
            ) : (
              <div className="px-4 py-2 w-full">
                {filtered.length > 50 && (
                  <div className="flex items-center gap-2 mb-3">
                    <Button
                      size="sm"
                      variant="flat"
                      isDisabled={page === 0}
                      onPress={() => setPage((value) => value - 1)}
                    >
                      Previous files
                    </Button>
                    <span className="text-xs text-default-500">
                      {page * 50 + 1}–{Math.min((page + 1) * 50, filtered.length)} of{' '}
                      {filtered.length}
                    </span>
                    <Button
                      size="sm"
                      variant="flat"
                      isDisabled={(page + 1) * 50 >= filtered.length}
                      onPress={() => setPage((value) => value + 1)}
                    >
                      Next files
                    </Button>
                  </div>
                )}

                <div className="space-y-2 w-full">
                  {visibleRows.map((job) => (
                    <Card
                      key={job.id}
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
                          <button
                            type="button"
                            aria-label={job.file.name}
                            aria-pressed={isSelected(job.id)}
                            disabled={selectionLocked || !onSelectJob}
                            onClick={() => onSelectJob?.(job.id)}
                            className="flex flex-col flex-1 min-w-0 text-left rounded-md p-1 cursor-pointer disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            <h4
                              className="font-medium text-sm text-foreground leading-tight flex items-center gap-2 w-full min-w-0"
                              title={job.file.name}
                            >
                              {isSelected(job.id) ? (
                                <CheckSquare
                                  size={16}
                                  className="text-primary shrink-0"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Square
                                  size={16}
                                  className="text-default-400 shrink-0"
                                  aria-hidden="true"
                                />
                              )}
                              <span className="truncate">{job.file.name}</span>
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
                            {job.mediaInfoError && (
                              <span className="text-xs text-default-500 mt-1">
                                Media details unavailable
                              </span>
                            )}
                            {job.error && (
                              <span className="text-xs text-danger mt-1 break-words select-text">
                                {job.error}
                              </span>
                            )}
                          </button>

                          <div className="flex items-center gap-2">
                            <Tooltip content="Edit per-file overrides">
                              <Button
                                isIconOnly
                                aria-label={`Edit overrides for ${job.file.name}`}
                                isDisabled={selectionLocked}
                                size="sm"
                                variant="light"
                                color={
                                  job.overrides && Object.keys(job.overrides).length > 0
                                    ? 'primary'
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
                                aria-label={`Remove ${job.file.name} from queue`}
                                size="sm"
                                variant="light"
                                color="danger"
                                onPress={() => {
                                  onRemoveJobs?.([job.id])
                                }}
                                isDisabled={isEncoding || isLocked}
                              >
                                <Trash2 size={16} />
                              </Button>
                            </Tooltip>
                            {job.overrides && Object.keys(job.overrides).length > 0 && (
                              <Chip
                                size="sm"
                                color="primary"
                                variant="flat"
                                className="text-[10px] px-2 py-0 h-5 flex-shrink-0"
                              >
                                Custom
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

        <Modal isOpen={!!editingJob} onClose={closeEdit} backdrop="blur" scrollBehavior="inside">
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
              <p className="text-sm text-default-500">
                Empty dropdowns and number fields use the batch settings.
              </p>
              {editingJob?.mediaInfo && (
                <>
                  {renderModalMediaInfo(editingJob.mediaInfo)}
                  <Divider />
                </>
              )}
              <Select
                label="Container"
                placeholder="Use batch setting"
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
                placeholder="Use batch setting"
                selectedKeys={overrideForm.videoCodec ? [overrideForm.videoCodec] : []}
                onSelectionChange={(keys) =>
                  handleOverrideChange('videoCodec', Array.from(keys)[0] as string)
                }
              >
                {VIDEO_ENCODERS.filter(
                  (encoder) =>
                    encoder.backend === 'copy' ||
                    (supportedEncoders
                      ? supportedEncoders.includes(encoder.key)
                      : encoder.backend === 'software' ||
                        (encoder.backend === 'nvidia' &&
                          hasNvidiaGpu &&
                          (!supportedNvidiaEncoders ||
                            supportedNvidiaEncoders.includes(encoder.key))))
                ).map((codec) => (
                  <SelectItem key={codec.key}>{codec.label}</SelectItem>
                ))}
              </Select>
              <Select
                label="Audio Codec"
                placeholder="Use batch setting"
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
                placeholder="Use batch setting"
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
                  placeholder="Use batch setting"
                  type="number"
                  value={overrideForm.videoBitrate?.toString() ?? ''}
                  onChange={(e) =>
                    handleOverrideChange(
                      'videoBitrate',
                      e.target.value === '' ? undefined : parseInt(e.target.value) || 0
                    )
                  }
                />
              ) : (
                <Input
                  label="CRF/CQ"
                  max={maxQualityFor(overrideForm.videoCodec ?? '')}
                  placeholder="Use batch setting"
                  type="number"
                  value={overrideForm.crf?.toString() ?? ''}
                  onChange={(e) =>
                    handleOverrideChange(
                      'crf',
                      e.target.value === '' ? undefined : parseInt(e.target.value) || 0
                    )
                  }
                />
              )}
              <Select
                label="Preset"
                placeholder="Use batch setting"
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
                placeholder="Use batch setting"
                selectedKeys={overrideForm.subtitleMode ? [overrideForm.subtitleMode] : []}
                onSelectionChange={(keys) =>
                  handleOverrideChange('subtitleMode', Array.from(keys)[0] as string)
                }
              >
                <SelectItem key="none">None (Remove Subtitles)</SelectItem>
                <SelectItem key="copy">Passthrough (Copy All)</SelectItem>
                <SelectItem key="text">Convert text subtitles</SelectItem>
              </Select>
              {editingJob?.mediaInfo && (
                <>
                  <Select
                    label="Audio stream"
                    placeholder="Use batch track selection"
                    selectedKeys={
                      overrideForm.audioStreamIndex === undefined
                        ? []
                        : [String(overrideForm.audioStreamIndex)]
                    }
                    onSelectionChange={(keys) => {
                      const value = Array.from(keys)[0]
                      handleOverrideChange(
                        'audioStreamIndex',
                        value === undefined ? undefined : Number(value)
                      )
                    }}
                  >
                    {editingJob.mediaInfo.streams
                      .filter((stream) => stream.codec_type === 'audio')
                      .map((stream) => (
                        <SelectItem key={String(stream.index)}>
                          Track {stream.index}: {stream.tags?.language ?? 'unknown language'} ·{' '}
                          {stream.codec_name}
                        </SelectItem>
                      ))}
                  </Select>
                  <Select
                    label="Subtitle stream"
                    placeholder="All source subtitles"
                    selectedKeys={
                      overrideForm.subtitleStreamIndex === undefined
                        ? []
                        : [String(overrideForm.subtitleStreamIndex)]
                    }
                    onSelectionChange={(keys) => {
                      const value = Array.from(keys)[0]
                      handleOverrideChange(
                        'subtitleStreamIndex',
                        value === undefined ? undefined : Number(value)
                      )
                    }}
                  >
                    {editingJob.mediaInfo.streams
                      .filter((stream) => stream.codec_type === 'subtitle')
                      .map((stream) => (
                        <SelectItem key={String(stream.index)}>
                          Track {stream.index}: {stream.tags?.language ?? 'unknown language'} ·{' '}
                          {stream.codec_name}
                        </SelectItem>
                      ))}
                  </Select>
                </>
              )}
              <Select
                label="Two-pass encoding"
                placeholder="Use batch setting"
                selectedKeys={
                  overrideForm.twoPass === undefined ? [] : [String(overrideForm.twoPass)]
                }
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0]
                  handleOverrideChange(
                    'twoPass',
                    value === undefined ? undefined : value === 'true'
                  )
                }}
              >
                <SelectItem key="true">Enabled</SelectItem>
                <SelectItem key="false">Disabled</SelectItem>
              </Select>
              <Input
                label="Per-file max retries"
                type="number"
                value={(overrideRetries ?? 0).toString()}
                onChange={(e) =>
                  setOverrideRetries(
                    Math.min(MAX_QUEUE_RETRIES, Math.max(0, parseInt(e.target.value) || 0))
                  )
                }
                min={0}
                max={MAX_QUEUE_RETRIES}
              />
            </ModalBody>
            <ModalFooter>
              <Button
                variant="flat"
                isDisabled={selectionLocked}
                onPress={() => {
                  setOverrideForm({})
                  setOverrideRetries(maxRetries ?? 0)
                }}
              >
                Reset to batch settings
              </Button>
              <Button variant="light" onPress={closeEdit}>
                Cancel
              </Button>
              <Button color="primary" onPress={handleOverrideSave} isDisabled={selectionLocked}>
                Save overrides
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        <DrawerFooter className="flex flex-col gap-2">
          <div className="flex justify-between items-center w-full px-2 pb-2">
            <ButtonGroup variant="flat" size="sm">
              <Tooltip
                content={
                  selectedJobIds.length > 0
                    ? 'Save selected files to a queue file'
                    : 'Save all files to a queue file'
                }
              >
                <Button
                  isIconOnly
                  aria-label={
                    selectedJobIds.length > 0 ? 'Save selected queue files' : 'Save queue'
                  }
                  isDisabled={jobs.length === 0}
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
                <Button
                  isIconOnly
                  aria-label="Load queue"
                  onPress={onLoadQueue}
                  isDisabled={isEncoding || isLocked}
                >
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
          {disabledReason && (
            <p id="queue-encoding-hint" role="status" className="text-sm text-default-600">
              {disabledReason}
            </p>
          )}
          <div className="flex gap-2 w-full">
            <Button variant="flat" onPress={onClose} className="flex-1">
              Close
            </Button>
            <Button
              color="primary"
              className="flex-1"
              onPress={onEncode}
              aria-describedby={disabledReason ? 'queue-encoding-hint' : undefined}
              isDisabled={selectionLocked || !canEncode || runnableCount === 0}
            >
              {isEncoding
                ? 'Encoding...'
                : runnableCount > 0
                  ? `Encode ${runnableCount} file${runnableCount !== 1 ? 's' : ''}`
                  : 'Encode selected'}
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
