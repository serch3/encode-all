import { Tabs, Tab } from '@heroui/react'
import { useState } from 'react'
import OutputPage from './OutputPage'
import type React from 'react'

interface GeneralPageProps {
  encoderContent: React.ReactNode
  logs: string[]
  onCancel: () => void
  isEncoding: boolean
}

export default function GeneralPage({
  encoderContent,
  logs,
  onCancel,
  isEncoding
}: GeneralPageProps): React.JSX.Element {
  const [selectedTab, setSelectedTab] = useState<string>('encoder')

  return (
    <div className="flex flex-col gap-4 h-full">
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
    </div>
  )
}
