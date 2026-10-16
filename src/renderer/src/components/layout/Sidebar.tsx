import { Button, Divider, Tooltip } from '@heroui/react'
import ThemeToggle from './ThemeToggle'
import type React from 'react'
import { Home, Settings, Info, List, Clapperboard, History } from 'lucide-react'

type SidebarProps = {
  active: 'general' | 'preview' | 'settings' | 'about' | 'history'
  onSelect: (key: SidebarProps['active']) => void
  onOpenQueue?: () => void
  queueStats?: { total: number; selected: number }
  isEncoding?: boolean
  isPreviewing?: boolean
}

export default function Sidebar({
  active,
  onSelect,
  onOpenQueue,
  queueStats,
  isEncoding,
  isPreviewing
}: SidebarProps): React.JSX.Element {
  return (
    <aside
      aria-label="App navigation"
      className="h-full w-16 shrink-0 border-r border-foreground/10 p-2 flex flex-col gap-2"
    >
      <Tooltip content="Encode videos" placement="right" delay={300}>
        <Button
          aria-label="Encode videos"
          aria-current={active === 'general' ? 'page' : undefined}
          variant={active === 'general' ? 'flat' : 'light'}
          onPress={() => onSelect('general')}
          isIconOnly
          className="w-12 h-12 relative"
        >
          <Home className="w-5 h-5" />
          {isEncoding && active !== 'general' && (
            <span className="absolute top-2 right-2">
              <span className="block w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
            </span>
          )}
        </Button>
      </Tooltip>

      <Tooltip content="Preview" placement="right" delay={300}>
        <Button
          aria-label={isPreviewing ? 'Preview, encoding sample' : 'Preview'}
          aria-current={active === 'preview' ? 'page' : undefined}
          variant={active === 'preview' ? 'flat' : 'light'}
          onPress={() => onSelect('preview')}
          isIconOnly
          className="w-12 h-12 relative"
        >
          <Clapperboard className="w-5 h-5" />
          {isPreviewing && (
            <span
              aria-hidden="true"
              className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary animate-pulse"
            />
          )}
        </Button>
      </Tooltip>

      <Tooltip content="Output history" placement="right" delay={300}>
        <Button
          aria-label="Output history"
          aria-current={active === 'history' ? 'page' : undefined}
          variant={active === 'history' ? 'flat' : 'light'}
          onPress={() => onSelect('history')}
          isIconOnly
          className="w-12 h-12"
        >
          <History className="w-5 h-5" />
        </Button>
      </Tooltip>
      <Tooltip content="Settings" placement="right" delay={300}>
        <Button
          aria-label="Settings"
          aria-current={active === 'settings' ? 'page' : undefined}
          variant={active === 'settings' ? 'flat' : 'light'}
          onPress={() => onSelect('settings')}
          isIconOnly
          className="w-12 h-12"
        >
          <Settings className="w-5 h-5" />
        </Button>
      </Tooltip>

      <Tooltip content="About" placement="right" delay={300}>
        <Button
          aria-label="About"
          aria-current={active === 'about' ? 'page' : undefined}
          variant={active === 'about' ? 'flat' : 'light'}
          onPress={() => onSelect('about')}
          isIconOnly
          className="w-12 h-12"
        >
          <Info className="w-5 h-5" />
        </Button>
      </Tooltip>

      <Divider className="my-2" />

      <Tooltip
        content={
          queueStats ? (
            <div className="px-1">
              <div>Queue</div>
              <div className="text-xs opacity-70">
                {queueStats.selected}/{queueStats.total} selected
              </div>
            </div>
          ) : (
            'Queue'
          )
        }
        placement="right"
        delay={300}
      >
        <Button
          aria-label={
            queueStats
              ? `Video queue, ${queueStats.selected} of ${queueStats.total} files selected`
              : 'Video queue'
          }
          variant="light"
          onPress={() => onOpenQueue?.()}
          isDisabled={!onOpenQueue}
          isIconOnly
          className="w-12 h-12 relative"
        >
          <List className="w-5 h-5" />
          {isEncoding && (
            <span className="absolute top-1 right-1">
              <span className="block w-2.5 h-2.5 rounded-full bg-success animate-pulse" />
            </span>
          )}
          {!isEncoding && queueStats && queueStats.total > 0 && (
            <span className="absolute top-1 right-1 bg-primary text-white text-[10px] rounded-full min-w-4 px-0.5 h-4 flex items-center justify-center">
              {queueStats.total > 99 ? '99+' : queueStats.total}
            </span>
          )}
        </Button>
      </Tooltip>

      <div className="mt-auto flex justify-center">
        <Tooltip content="Toggle theme" placement="right" delay={300}>
          <div className="flex items-center">
            <ThemeToggle />
          </div>
        </Tooltip>
      </div>
    </aside>
  )
}
