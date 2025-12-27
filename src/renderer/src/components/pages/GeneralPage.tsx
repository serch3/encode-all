import { Tabs, Tab, Card, CardBody, Progress } from '@heroui/react'
import { useState } from 'react'
import OutputPage from './OutputPage'
import type React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface GeneralPageProps {
  encoderContent: React.ReactNode
  logs: string[]
  onCancel: () => void
  isEncoding: boolean
  encodingProgress: number
  currentEncodingFile: string
  encodingError?: string | null
  onClearError?: () => void
}

export default function GeneralPage({
  encoderContent,
  logs,
  onCancel,
  isEncoding,
  encodingProgress,
  currentEncodingFile,
  encodingError,
  onClearError
}: GeneralPageProps): React.JSX.Element {
  const [selectedTab, setSelectedTab] = useState<string>('encoder')

  const handleToastClick = (): void => {
    if (encodingError) {
      setSelectedTab('output')
      onClearError?.()
    }
  }

  return (
    <div className="flex flex-col gap-4 h-full relative">
      <Tabs
        selectedKey={selectedTab}
        onSelectionChange={(key) => setSelectedTab(key as string)}
        aria-label="General tabs"
        color="primary"
        variant="underlined"
      >
        <Tab key="encoder" title="Encoder">
          <div className="py-4">{encoderContent}</div>
        </Tab>
        <Tab key="output" title="Output">
          <div className="py-4 h-[calc(100vh-180px)]">
            <OutputPage logs={logs} onCancel={onCancel} isEncoding={isEncoding} />
          </div>
        </Tab>
      </Tabs>

      <AnimatePresence>
        {(isEncoding || encodingError) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-4 right-4 left-4 md:left-auto md:w-96 z-50 cursor-pointer"
            onClick={handleToastClick}
          >
            <Card 
              className={`${
                encodingError 
                  ? 'bg-danger-50/90 border-danger-200 dark:bg-danger-900/20 dark:border-danger-500/30' 
                  : 'bg-content1/90 border-white/10'
              } backdrop-blur-md shadow-lg border`}
            >
              <CardBody className="gap-2">
                <div className="flex justify-between items-center">
                  <span className={`text-xs font-medium uppercase tracking-wider ${
                    encodingError ? 'text-danger' : 'text-foreground/80'
                  }`}>
                    {encodingError ? 'Encoding Failed' : 'Encoding in progress'}
                  </span>
                  {!encodingError && (
                    <span className="text-xs text-foreground/60">{Math.round(encodingProgress)}%</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm truncate flex-1 font-medium">
                    {encodingError ? 'Click to view logs' : (currentEncodingFile || 'Initializing...')}
                  </span>
                </div>
                <Progress
                  size="sm"
                  value={encodingError ? 100 : encodingProgress}
                  color={encodingError ? "danger" : "primary"}
                  classNames={{
                    base: "max-w-full",
                    track: "drop-shadow-md border border-default",
                    indicator: encodingError ? "" : "bg-gradient-to-r from-primary-500 to-secondary-500",
                    label: "tracking-wider font-medium text-default-600",
                    value: "text-foreground/60"
                  }}
                  aria-label={encodingError ? "Encoding failed" : "Encoding progress"}
                />
              </CardBody>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
