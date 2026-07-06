import { Card, CardBody, Progress, Button, ScrollShadow, Chip } from '@heroui/react'
import { useEffect, useRef, useMemo } from 'react'
import type { QueuedJob } from '../../types'
import { parseFfmpegStats } from '../../utils/ffmpegStats'
import {
  Activity,
  Zap,
  Clock,
  HardDrive,
  FileVideo,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2
} from 'lucide-react'

interface EncodingProgressPageProps {
  progress: number
  currentFile?: string
  logs: string[]
  onCancel: () => void
  isEncoding: boolean
  encodingError?: string | null
  eta?: string | null
  activeJobs?: QueuedJob[]
  onDismiss?: () => void
}

const StatCard = ({
  icon: Icon,
  label,
  value
}: {
  icon: React.ElementType
  label: string
  value: string
}): React.JSX.Element => (
  <Card shadow="sm" className="bg-content2/50 border border-content3">
    <CardBody className="p-3 flex flex-row items-center gap-3">
      <div className="p-2 rounded-full bg-primary/10 text-primary shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex flex-col overflow-hidden">
        <span className="text-xs text-foreground/60 truncate">{label}</span>
        <span className="font-mono font-medium text-sm truncate">{value}</span>
      </div>
    </CardBody>
  </Card>
)

const EncodingProgressPage = ({
  progress,
  currentFile,
  logs,
  onCancel,
  isEncoding,
  encodingError,
  eta,
  activeJobs = [],
  onDismiss
}: EncodingProgressPageProps): React.JSX.Element => {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  const stats = useMemo(() => parseFfmpegStats(logs), [logs])

  const getStatusIcon = (status: QueuedJob['status']): React.JSX.Element => {
    switch (status) {
      case 'complete':
        return <CheckCircle2 className="w-4 h-4 text-success" />
      case 'error':
        return <XCircle className="w-4 h-4 text-danger" />
      case 'encoding':
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />
      default:
        return <Clock className="w-4 h-4 text-default-400" />
    }
  }

  return (
    <div className="flex flex-col gap-4 h-full max-h-[calc(100vh-200px)] pb-4">
      <Card shadow="sm" className="flex-shrink-0">
        <CardBody className="gap-5">
          <div className="flex justify-between items-center">
            <div className="min-w-0 pr-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Encoding Session
              </h2>
              {currentFile && (
                <div className="text-sm text-foreground/70 mt-1 truncate">
                  Processing:{' '}
                  <span className="font-mono font-semibold text-foreground">{currentFile}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              {!isEncoding && onDismiss && (
                <Button variant="flat" onPress={onDismiss}>
                  Back to Encoding Settings
                </Button>
              )}
              {isEncoding && (
                <Button color="danger" variant="flat" onPress={onCancel}>
                  Cancel All
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Activity} label="FPS" value={stats.fps} />
            <StatCard icon={Zap} label="Speed" value={stats.speed} />
            <StatCard icon={Clock} label="Time Encoded" value={stats.time} />
            <StatCard icon={HardDrive} label="Current Size" value={stats.size} />
          </div>

          <div className="flex flex-col gap-2 w-full mt-2">
            <div className="flex justify-between items-center text-sm">
              <span className="font-medium text-foreground/80">Overall Progress</span>
              {eta && eta !== '--' && (
                <Chip size="sm" variant="flat" color="primary" className="border-none">
                  ETA: <span className="font-mono">{eta}</span>
                </Chip>
              )}
            </div>
            <Progress
              value={progress}
              color="primary"
              showValueLabel={true}
              className="max-w-full"
              classNames={{
                indicator: 'bg-gradient-to-r from-primary to-secondary'
              }}
              aria-label="Overall Progress"
            />
          </div>

          {encodingError && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold">Encoding failed</div>
                <div className="text-danger/80 break-words">{encodingError}</div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card shadow="sm" className="flex-1 min-h-[200px]">
        <CardBody className="p-0 flex flex-col h-full">
          <div className="px-4 py-3 border-b border-divider flex items-center justify-between bg-content2/30">
            <h3 className="font-semibold flex items-center gap-2">
              <FileVideo className="w-4 h-4 opacity-70" />
              Queue Overview
            </h3>
            <span className="text-xs text-foreground/50 bg-content3/50 px-2 py-0.5 rounded-md">
              {activeJobs.length} items
            </span>
          </div>

          <ScrollShadow className="flex-1 overflow-y-auto p-2">
            <div className="flex flex-col gap-1">
              {activeJobs.map((job) => (
                <div
                  key={job.id}
                  className={`p-3 rounded-lg border ${job.status === 'encoding' ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:bg-content2'} flex items-center gap-3 transition-colors`}
                >
                  <div className="shrink-0 pt-0.5">{getStatusIcon(job.status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <span
                        className={`text-sm truncate font-medium ${job.status === 'encoding' ? 'text-primary' : 'text-foreground/80'}`}
                      >
                        {job.file.name}
                      </span>
                      {job.status === 'encoding' && (
                        <span className="text-xs font-mono text-primary/80 ml-2 shrink-0">
                          {Math.round(job.progress)}%
                        </span>
                      )}
                    </div>
                    {job.status === 'encoding' && (
                      <Progress
                        value={job.progress}
                        size="sm"
                        color="primary"
                        aria-label={`${job.file.name} progress`}
                        classNames={{
                          track: 'h-1',
                          indicator: 'h-1'
                        }}
                      />
                    )}
                    {job.status === 'error' && (
                      <div className="text-xs text-danger mt-1 bg-danger/10 px-2 py-1 rounded inline-block truncate max-w-full">
                        {job.error || 'Failed'}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {activeJobs.length === 0 && (
                <div className="p-8 text-center text-foreground/40 text-sm italic">
                  No files queued or selected.
                </div>
              )}
            </div>
          </ScrollShadow>
        </CardBody>
      </Card>

      <Card shadow="sm" className="h-95 shrink-0">
        <CardBody className="p-0 flex flex-col h-full bg-black/5 dark:bg-black/30">
          <div className="px-3 py-1.5 border-b border-divider/50 bg-content2/50 text-xs font-semibold text-foreground/60 flex items-center justify-between">
            <span>Terminal Output</span>
            <span className="text-[10px] font-normal opacity-70">Latest runtime logs</span>
          </div>
          <ScrollShadow
            className="flex-1 p-2 font-mono text-[10px] overflow-y-auto select-text text-foreground/70"
            ref={scrollRef}
          >
            {logs.length === 0 ? (
              <div className="opacity-40 italic">Waiting for logs...</div>
            ) : (
              logs.slice(-50).map((log, index) => (
                <div key={index} className="whitespace-pre-wrap break-all leading-tight">
                  {log}
                </div>
              ))
            )}
          </ScrollShadow>
        </CardBody>
      </Card>
    </div>
  )
}

export default EncodingProgressPage
