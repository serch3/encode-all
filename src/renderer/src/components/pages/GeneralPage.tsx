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
}

export default function GeneralPage({
  encoderContent,
  logs,
  onCancel,
  isEncoding,
  encodingProgress,
  currentEncodingFile
}: GeneralPageProps): React.JSX.Element {
  const [selectedTab, setSelectedTab] = useState<string>('encoder')

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
        {isEncoding && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-4 right-4 left-4 md:left-auto md:w-96 z-50"
          >
            <Card className="bg-content1/90 backdrop-blur-md shadow-lg border border-white/10">
              <CardBody className="gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-foreground/80 uppercase tracking-wider">
                    Encoding in progress
                  </span>
                  <span className="text-xs text-foreground/60">{Math.round(encodingProgress)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm truncate flex-1 font-medium">
                    {currentEncodingFile || 'Initializing...'}
                  </span>
                </div>
                <Progress
                  size="sm"
                  value={encodingProgress}
                  color="primary"
                  classNames={{
                    base: "max-w-full",
                    track: "drop-shadow-md border border-default",
                    indicator: "bg-gradient-to-r from-primary-500 to-secondary-500",
                    label: "tracking-wider font-medium text-default-600",
                    value: "text-foreground/60"
                  }}
                  aria-label="Encoding progress"
                />
              </CardBody>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
