import { Card, CardBody, Button, ScrollShadow, Divider } from '@heroui/react'
import { CheckCircle2, XCircle, FolderOpen, RotateCcw, LayoutList } from 'lucide-react'
import type { EncodingSummary } from '../../types'

interface EncodingSummaryPageProps {
  summary: EncodingSummary
  onDismiss: () => void
  onReviewFailed?: () => void
}

export default function EncodingSummaryPage({
  summary,
  onDismiss,
  onReviewFailed
}: EncodingSummaryPageProps): React.JSX.Element {
  const isCompleteSuccess = summary.failed === 0 && summary.canceled === 0

  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
    if (minutes > 0) return `${minutes}m ${seconds}s`
    return `${seconds}s`
  }

  const duration = formatDuration(summary.endTime - summary.startTime)
  const isPartialSuccess = summary.successful > 0 && (summary.failed > 0 || summary.canceled > 0)

  return (
    <div className="flex flex-col gap-4 h-full pb-4 items-center justify-center">
      <Card shadow="sm" className="w-full max-w-2xl mt-8">
        <CardBody className="p-8 flex flex-col items-center text-center gap-6">
          <div className="relative">
            <div
              className={`p-4 rounded-full ${isCompleteSuccess ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}
            >
              {isCompleteSuccess ? (
                <CheckCircle2 className="w-16 h-16" />
              ) : (
                <XCircle className="w-16 h-16" />
              )}
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold mb-2">
              {isCompleteSuccess
                ? 'Encoding Complete'
                : isPartialSuccess
                  ? 'Encoding Partially Complete'
                  : 'Encoding Failed or Canceled'}
            </h2>
            <p className="text-foreground/60 max-w-md mx-auto">
              Finished processing {summary.jobs.length} file{summary.jobs.length !== 1 ? 's' : ''}{' '}
              in {duration}.
            </p>
          </div>

          <div className="w-full grid grid-cols-3 gap-4 py-4">
            <div className="flex flex-col items-center bg-content2/50 rounded-lg p-3">
              <span className="text-3xl font-bold text-success">{summary.successful}</span>
              <span className="text-xs text-foreground/60 uppercase font-semibold tracking-wider">
                Successful
              </span>
            </div>
            <div className="flex flex-col items-center bg-content2/50 rounded-lg p-3">
              <span className="text-3xl font-bold text-danger">{summary.failed}</span>
              <span className="text-xs text-foreground/60 uppercase font-semibold tracking-wider">
                Failed
              </span>
            </div>
            <div className="flex flex-col items-center bg-content2/50 rounded-lg p-3">
              <span className="text-3xl font-bold text-warning">{summary.canceled}</span>
              <span className="text-xs text-foreground/60 uppercase font-semibold tracking-wider">
                Canceled
              </span>
            </div>
          </div>

          <Divider />

          <div className="w-full flex justify-between gap-4 py-2 text-sm">
            <div className="flex items-center gap-2 text-foreground/80">
              <FolderOpen className="w-4 h-4" />
              <span className="font-mono text-xs">
                {summary.outputDirectory || 'Input directories'}
              </span>
            </div>
          </div>

          <div className="w-full flex gap-3 mt-4">
            {summary.failed > 0 && onReviewFailed && (
              <Button
                color="warning"
                variant="flat"
                className="flex-1"
                startContent={<LayoutList className="w-4 h-4" />}
                onPress={onReviewFailed}
              >
                Review Failed Items
              </Button>
            )}
            <Button
              color="primary"
              className="flex-1 font-semibold"
              startContent={<RotateCcw className="w-4 h-4" />}
              onPress={onDismiss}
            >
              Start Another Batch
            </Button>
          </div>
        </CardBody>
      </Card>

      {summary.jobs.length > 0 && (
        <Card shadow="sm" className="w-full max-w-2xl max-h-64 flex-1">
          <CardBody className="p-0">
            <div className="px-4 py-3 border-b border-divider bg-content2/30 font-semibold text-sm">
              Job Summary
            </div>
            <ScrollShadow className="p-2 overflow-y-auto">
              <div className="flex flex-col gap-1">
                {summary.jobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between p-2 rounded hover:bg-content2 transition-colors"
                  >
                    <span className="text-sm truncate text-foreground/80">{job.file.name}</span>
                    <span
                      className={`text-xs ml-4 shrink-0 font-medium ${
                        job.status === 'complete'
                          ? 'text-success'
                          : job.status === 'error'
                            ? 'text-danger'
                            : 'text-warning'
                      }`}
                    >
                      {job.status === 'complete'
                        ? 'Success'
                        : job.status === 'error'
                          ? 'Failed'
                          : 'Canceled'}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollShadow>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
