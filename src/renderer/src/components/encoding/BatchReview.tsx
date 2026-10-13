import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner
} from '@heroui/react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { useBatchReview } from '../../hooks/useBatchReview'

interface Props {
  review: ReturnType<typeof useBatchReview>
  canEncode: boolean
  onStart: () => void
  onReviewQueue: () => void
}

export default function BatchReview({
  review,
  canEncode,
  onStart,
  onReviewQueue
}: Props): React.JSX.Element {
  const blocked = review.entries.filter((entry) => entry.errors.length > 0).length
  return (
    <Modal isOpen={review.isOpen} onClose={review.close} size="3xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span>Review batch outputs</span>
          <span className="text-sm font-normal text-default-500">
            Check where each encoded video will be saved.
          </span>
        </ModalHeader>
        <ModalBody className="gap-3">
          {review.busy && (
            <div role="status" className="flex items-center gap-3 py-8">
              <Spinner size="sm" />
              Checking source files, settings, and output folders…
            </div>
          )}
          {review.error && (
            <p role="alert" className="text-sm text-danger">
              {review.error}
            </p>
          )}
          {review.stale && (
            <p role="alert" className="text-sm text-warning-700 dark:text-warning-400">
              The batch settings or selection changed. Check outputs again before starting.
            </p>
          )}
          {!review.busy && review.entries.length > 0 && (
            <p role="status" className="text-sm text-default-600">
              {review.entries.length} video{review.entries.length === 1 ? '' : 's'} ·{' '}
              {blocked > 0
                ? `${blocked} need attention before encoding.`
                : 'Ready to encode. Existing files will be kept.'}
            </p>
          )}
          {review.entries.map((entry) => (
            <div key={entry.jobId} className="border border-divider rounded-xl p-3 space-y-2">
              <div className="flex items-start gap-2">
                {entry.errors.length > 0 ? (
                  <AlertTriangle size={18} className="text-danger shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 size={18} className="text-success shrink-0 mt-0.5" />
                )}
                <span className="text-sm font-semibold break-all">{entry.name}</span>
              </div>
              <p className="text-xs text-default-500 break-all select-text">
                Source: {entry.inputPath}
              </p>
              <p className="text-sm text-default-700 break-all select-text">
                Output: {entry.outputPath}
              </p>
              <p className="text-xs text-default-500">
                {entry.encoding.container.toUpperCase()} · {entry.encoding.videoCodec} ·{' '}
                {entry.encoding.audioCodec}
                {entry.encoding.twoPass ? ' · Two-pass' : ''}
              </p>
              {entry.errors.map((message, index) => (
                <p key={index} className="text-sm text-danger">
                  {message}
                </p>
              ))}
              {entry.warnings.map((message, index) => (
                <p key={index} className="text-sm text-warning-700 dark:text-warning-400">
                  {message}
                </p>
              ))}
            </div>
          ))}
        </ModalBody>
        <ModalFooter className="flex-wrap">
          <Button variant="light" onPress={review.close}>
            Back to settings
          </Button>
          {blocked > 0 && (
            <Button variant="flat" onPress={onReviewQueue}>
              Review queue
            </Button>
          )}
          {(review.error || review.stale) && (
            <Button variant="flat" onPress={review.review} isLoading={review.busy}>
              Check outputs again
            </Button>
          )}
          <Button color="primary" onPress={onStart} isDisabled={!canEncode || !review.canStart}>
            Start batch
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
