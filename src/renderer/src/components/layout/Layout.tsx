import Sidebar from './Sidebar'
import { Progress } from '@heroui/react'
import type React from 'react'

type LayoutProps = {
  title?: string
  active: 'general' | 'settings' | 'about'
  onSelect: (key: LayoutProps['active']) => void
  children: React.ReactNode
  onOpenQueue?: () => void
  queueStats?: { total: number; selected: number }
  encodingProgress?: number
  currentEncodingFile?: string
  isEncoding?: boolean
}

export default function Layout({
  active,
  onSelect,
  children,
  onOpenQueue,
  queueStats,
  encodingProgress,
  currentEncodingFile,
  isEncoding
}: LayoutProps): React.JSX.Element {
  return (
    <div className="h-screen w-screen overflow-hidden">
      <div className="h-full flex flex-col">
        <div className="flex-1 flex min-h-0">
          <Sidebar
            active={active}
            onSelect={onSelect}
            onOpenQueue={onOpenQueue}
            queueStats={queueStats}
          />
          <main className="flex-1 overflow-auto p-4 bg-background/40/0">{children}</main>
        </div>
        {isEncoding && (
          <div className="border-t border-foreground/10 p-3 bg-background">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-medium">Encoding:</span>
              <span className="text-sm text-foreground/70 truncate flex-1">
                {currentEncodingFile || 'Processing...'}
              </span>
            </div>
            <Progress
              value={encodingProgress || 0}
              color="primary"
              showValueLabel={true}
              className="max-w-full"
              size="sm"
            />
          </div>
        )}
      </div>
    </div>
  )
}
