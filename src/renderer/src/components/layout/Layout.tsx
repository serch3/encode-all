import Sidebar from './Sidebar'
import type React from 'react'

type LayoutProps = {
  title?: string
  active: 'general' | 'settings' | 'about'
  onSelect: (key: LayoutProps['active']) => void
  children: React.ReactNode
  onOpenQueue?: () => void
  queueStats?: { total: number; selected: number }
}

export default function Layout({
  active,
  onSelect,
  children,
  onOpenQueue,
  queueStats
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
          <main className="flex-1 overflow-auto p-4 bg-background/40/0 relative">{children}</main>
        </div>
      </div>
    </div>
  )
}
