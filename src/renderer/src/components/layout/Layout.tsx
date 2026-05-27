import Sidebar from './Sidebar'
import type React from 'react'

type LayoutProps = {
  title?: string
  active: 'general' | 'settings' | 'about'
  onSelect: (key: LayoutProps['active']) => void
  children: React.ReactNode
  onOpenQueue?: () => void
  queueStats?: { total: number; selected: number }
  isEncoding?: boolean
  overallProgress?: number
}

export default function Layout({
  active,
  onSelect,
  children,
  onOpenQueue,
  queueStats,
  isEncoding,
  overallProgress
}: LayoutProps): React.JSX.Element {
  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col">
      {isEncoding && overallProgress !== undefined && (
        <div className="w-full h-1 bg-default-200 shrink-0">
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-secondary-500 transition-all duration-300"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      )}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex min-h-0">
          <Sidebar
            active={active}
            onSelect={onSelect}
            onOpenQueue={onOpenQueue}
            queueStats={queueStats}
            isEncoding={isEncoding}
          />
          <main className="flex-1 overflow-auto p-4 bg-background/40/0 relative">{children}</main>
        </div>
      </div>
    </div>
  )
}
