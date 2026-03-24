import { Card, CardBody, Progress } from '@heroui/react'
import EncodingProgressPage from './EncodingProgressPage'
import type React from 'react'
import type { QueuedJob } from '../../types'

interface GeneralPageProps {
  encoderContent: React.ReactNode
  logs: string[]
  onCancel: () => void
  isEncoding: boolean
  encodingProgress: number
  currentEncodingFile: string
  encodingError?: string | null
  onClearError?: () => void
  eta?: string | null
  overallProgress?: number
  activeJobs?: QueuedJob[]
  showProgressPage?: boolean
  onDismissProgress?: () => void
}

export default function GeneralPage({
  encoderContent,
  logs,
  onCancel,
  isEncoding,
  encodingProgress,
  currentEncodingFile,
  encodingError,
  eta,
  overallProgress,
  activeJobs,
  showProgressPage,
  onDismissProgress
}: GeneralPageProps): React.JSX.Element {
  return (
    <div className="flex flex-col h-full relative">
      <div className="flex-1 py-4 flex flex-col min-h-0">
        {showProgressPage ? (
          <EncodingProgressPage
            progress={overallProgress ?? encodingProgress}
            currentFile={currentEncodingFile}
            logs={logs}
            onCancel={onCancel}
            isEncoding={isEncoding}
            encodingError={encodingError}
            eta={eta}
            activeJobs={activeJobs}
            onDismiss={onDismissProgress}
          />
        ) : (
          encoderContent
        )}
      </div>
    </div>
  )
}
