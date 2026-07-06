import Sidebar from './Sidebar'
import type React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

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
          <main className="flex-1 overflow-hidden bg-background/40 relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 p-4 overflow-auto"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  )
}
